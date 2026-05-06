import { describe, expect, it, vi } from "vitest";
import { GitHubPortfolioClient, GitHubPortfolioError, type FetchLike } from "./github-client.js";

// STORY-040 — `vi.fn()`-driven tests for the hand-rolled GitHub REST client. We mock `fetch`
// directly so no network ever fires and we can assert exact request shapes.

const TOKEN = "ghp_fake_token";

// Helper — build a minimal fake `fetch` that returns a JSON `Response` with the given status.
function fakeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeTextResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

describe("GitHubPortfolioClient (constructor)", () => {
  it("throws when token is empty", () => {
    expect(() => new GitHubPortfolioClient({ token: "" })).toThrow(/token is required/);
  });

  it("throws when token is whitespace only", () => {
    expect(() => new GitHubPortfolioClient({ token: "   " })).toThrow(/token is required/);
  });

  it("constructs with a token + injected fetch + apiBase", () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response(null, { status: 200 }));
    const client = new GitHubPortfolioClient({
      token: TOKEN,
      fetch: fetchImpl,
      apiBase: "https://api.example.test/",
    });
    expect(client).toBeInstanceOf(GitHubPortfolioClient);
  });
});

describe("ensureRepoExists", () => {
  it("returns { created: false } when GET /repos/:owner/:name returns 200", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      fakeJsonResponse(200, { name: "learnpro-portfolio" }),
    );
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    const out = await client.ensureRepoExists("octocat", "learnpro-portfolio");
    expect(out).toEqual({ created: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    const [url, init] = call;
    expect(url).toBe("https://api.github.com/repos/octocat/learnpro-portfolio");
    expect(init?.method).toBe("GET");
    const headers = init?.headers as Record<string, string>;
    expect(headers["authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(headers["accept"]).toBe("application/vnd.github+json");
    expect(headers["x-github-api-version"]).toBe("2022-11-28");
  });

  it("creates the repo when GET returns 404, then returns { created: true }", async () => {
    let nthCall = 0;
    const fetchImpl = vi.fn<FetchLike>(async (_url, init) => {
      nthCall += 1;
      if (nthCall === 1) {
        return fakeJsonResponse(404, { message: "Not Found" });
      }
      // POST /user/repos
      const body = JSON.parse((init?.body ?? "{}") as string) as Record<string, unknown>;
      expect(body["name"]).toBe("learnpro-portfolio");
      expect(body["auto_init"]).toBe(true);
      expect(body["private"]).toBe(false);
      return fakeJsonResponse(201, { name: "learnpro-portfolio" });
    });
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    const out = await client.ensureRepoExists("octocat", "learnpro-portfolio");
    expect(out).toEqual({ created: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = fetchImpl.mock.calls[1];
    if (!second) throw new Error("fetch not called twice");
    expect(second[1]?.method).toBe("POST");
  });

  it("throws GitHubPortfolioError when the GET fails with a non-200/404 status", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => fakeTextResponse(401, "Bad credentials"));
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    await expect(client.ensureRepoExists("octocat", "learnpro-portfolio")).rejects.toThrow(
      GitHubPortfolioError,
    );
  });

  it("throws GitHubPortfolioError when the POST /user/repos fails", async () => {
    let nthCall = 0;
    const fetchImpl = vi.fn<FetchLike>(async () => {
      nthCall += 1;
      if (nthCall === 1) return fakeJsonResponse(404, { message: "Not Found" });
      return fakeTextResponse(422, "Validation failed");
    });
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    await expect(client.ensureRepoExists("octocat", "learnpro-portfolio")).rejects.toThrow(
      /post failed.*HTTP 422/i,
    );
  });

  it("throws when owner contains a slash", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => fakeJsonResponse(200, {}));
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    await expect(client.ensureRepoExists("octo/cat", "learnpro-portfolio")).rejects.toThrow(
      /owner must not contain/,
    );
  });

  it("throws when name is empty", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => fakeJsonResponse(200, {}));
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    await expect(client.ensureRepoExists("octocat", "")).rejects.toThrow(/name must be non-empty/);
  });
});

describe("pushFile", () => {
  it("PUTs the contents API with base64-encoded body and returns the new commit SHA", async () => {
    const fetchImpl = vi.fn<FetchLike>(async (_url, init) => {
      const body = JSON.parse((init?.body ?? "{}") as string) as {
        message: string;
        content: string;
      };
      expect(body.message).toBe("Add hello.txt");
      expect(body.content).toBe(Buffer.from("hello", "utf-8").toString("base64"));
      return fakeJsonResponse(201, { commit: { sha: "abcd1234" } });
    });
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    const out = await client.pushFile(
      "octocat",
      "learnpro-portfolio",
      "py/hello.txt",
      "hello",
      "Add hello.txt",
    );
    expect(out).toEqual({ commit_sha: "abcd1234" });
    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    const [url, init] = call;
    expect(url).toBe(
      "https://api.github.com/repos/octocat/learnpro-portfolio/contents/py/hello.txt",
    );
    expect(init?.method).toBe("PUT");
  });

  it("retries with the prior blob's sha when the first PUT returns 422 (file exists)", async () => {
    let nthCall = 0;
    const fetchImpl = vi.fn<FetchLike>(async (_url, init) => {
      nthCall += 1;
      if (nthCall === 1) {
        return fakeTextResponse(422, "sha required");
      }
      if (nthCall === 2) {
        return fakeJsonResponse(200, { sha: "existing_sha_xyz" });
      }
      const body = JSON.parse((init?.body ?? "{}") as string) as { sha?: string };
      expect(body.sha).toBe("existing_sha_xyz");
      return fakeJsonResponse(200, { commit: { sha: "newcommitsha" } });
    });
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    const out = await client.pushFile(
      "octocat",
      "learnpro-portfolio",
      "py/hello.txt",
      "world",
      "Update hello.txt",
    );
    expect(out).toEqual({ commit_sha: "newcommitsha" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws GitHubPortfolioError when the first PUT fails with a non-422 status", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => fakeTextResponse(403, "Forbidden"));
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    await expect(
      client.pushFile("octocat", "learnpro-portfolio", "py/hello.txt", "hi", "Msg"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws when the path has a leading slash", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => fakeJsonResponse(200, {}));
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    await expect(
      client.pushFile("octocat", "learnpro-portfolio", "/py/hello.txt", "hi", "Msg"),
    ).rejects.toThrow(/path must be non-empty and have no leading\/trailing slash/);
  });

  it("throws when the message is empty", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => fakeJsonResponse(200, {}));
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    await expect(
      client.pushFile("octocat", "learnpro-portfolio", "py/hello.txt", "hi", ""),
    ).rejects.toThrow(/commit message must be non-empty/);
  });

  it("URL-encodes path segments but preserves slashes (so 'a b/c' becomes 'a%20b/c')", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => fakeJsonResponse(201, { commit: { sha: "x" } }));
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    await client.pushFile("octocat", "p", "a b/c d.txt", "hi", "Msg");
    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    expect(call[0]).toContain("/contents/a%20b/c%20d.txt");
  });

  it("throws if the API response is missing commit.sha (defends against shape drift)", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => fakeJsonResponse(201, { commit: {} }));
    const client = new GitHubPortfolioClient({ token: TOKEN, fetch: fetchImpl });
    await expect(
      client.pushFile("octocat", "learnpro-portfolio", "py/hello.txt", "hi", "Msg"),
    ).rejects.toThrow(/missing commit\.sha/);
  });
});

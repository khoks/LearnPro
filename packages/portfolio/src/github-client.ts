// STORY-040 — minimal GitHub REST client for portfolio pushes. We deliberately hand-roll
// against `fetch` instead of pulling in `@octokit/rest` — Octokit ships ~25 transitive deps for
// auth/retries/pagination we don't need here. Two endpoints suffice:
//
//   1. POST /user/repos     — create the portfolio repo if it doesn't exist
//   2. PUT  /repos/{owner}/{repo}/contents/{path} — create OR update a file
//
// `fetch` is injected so unit tests can pass a vi.fn(). Callers pass the elevated-scope token
// (granted via the `repo` OAuth flow in apps/web) — this module never reads env vars.

const DEFAULT_API_BASE = "https://api.github.com";
const ACCEPT_HEADER = "application/vnd.github+json";
const API_VERSION = "2022-11-28";

export class GitHubPortfolioError extends Error {
  readonly status: number;
  readonly body: string | undefined;
  constructor(message: string, status: number, body?: string) {
    super(message);
    this.name = "GitHubPortfolioError";
    this.status = status;
    if (body !== undefined) this.body = body;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface EnsureRepoOutput {
  created: boolean;
}

export interface PushFileOutput {
  commit_sha: string;
}

export interface GitHubPortfolioClientOptions {
  // The user's elevated-scope GitHub access token (granted via the apps/web `repo` OAuth flow).
  token: string;
  // Inject a fake `fetch` for tests.
  fetch?: FetchLike;
  // Override the API base for tests / a hypothetical GitHub Enterprise host.
  apiBase?: string;
}

export class GitHubPortfolioClient {
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly apiBase: string;

  constructor(opts: GitHubPortfolioClientOptions) {
    if (!opts.token || opts.token.trim() === "") {
      throw new Error("GitHubPortfolioClient: token is required");
    }
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? fetch;
    this.apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  }

  // Ensures `<owner>/<name>` exists. Returns `{ created: false }` when the repo already exists,
  // `{ created: true }` after creating it. Any other GitHub error surfaces as
  // GitHubPortfolioError so callers can translate to a coach-voice message. We deliberately do
  // NOT use the "create repo" idempotency tricks (e.g. POST then ignore 422); a dedicated GET
  // first keeps the side-effect explicit.
  async ensureRepoExists(owner: string, name: string): Promise<EnsureRepoOutput> {
    requireSegment(owner, "owner");
    requireSegment(name, "name");

    const getRes = await this.fetchImpl(`${this.apiBase}/repos/${owner}/${name}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (getRes.status === 200) {
      return { created: false };
    }
    if (getRes.status !== 404) {
      throw await toError("ensureRepoExists.get", getRes);
    }

    // Create the repo on the authenticated user's account. We never set `org` — the portfolio
    // repo lives under the user's personal namespace.
    const postRes = await this.fetchImpl(`${this.apiBase}/user/repos`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: "My LearnPro portfolio.",
        private: false,
        auto_init: true,
      }),
    });
    if (postRes.status !== 201) {
      throw await toError("ensureRepoExists.post", postRes);
    }
    return { created: true };
  }

  // Creates or updates a single file at `path` inside `<owner>/<name>`. Returns the new commit
  // SHA the API hands back. The PUT contents endpoint requires a base64-encoded `content`; the
  // function takes UTF-8 strings and handles the encoding here so callers stay simple. When the
  // file already exists at HEAD, the API requires `sha` of the prior blob — we fetch it lazily
  // (one HEAD-equivalent GET) before retrying.
  async pushFile(
    owner: string,
    name: string,
    path: string,
    content: string,
    message: string,
  ): Promise<PushFileOutput> {
    requireSegment(owner, "owner");
    requireSegment(name, "name");
    if (!path || path.startsWith("/") || path.endsWith("/")) {
      throw new Error("pushFile: path must be non-empty and have no leading/trailing slash");
    }
    if (!message || message.trim() === "") {
      throw new Error("pushFile: commit message must be non-empty");
    }

    const url = `${this.apiBase}/repos/${owner}/${name}/contents/${encodePath(path)}`;
    const body: PutContentsBody = {
      message,
      content: encodeBase64(content),
    };
    const firstRes = await this.fetchImpl(url, {
      method: "PUT",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (firstRes.status === 200 || firstRes.status === 201) {
      return { commit_sha: await readCommitSha(firstRes) };
    }
    if (firstRes.status === 422) {
      // Most likely cause: file exists at HEAD and we didn't pass `sha`. GitHub also returns 422
      // for "branch is required" / "invalid file mode" — consume the body so callers can read it
      // in the error if the retry below fails.
      const existingSha = await this.fetchExistingFileSha(owner, name, path);
      if (existingSha) {
        body.sha = existingSha;
        const retryRes = await this.fetchImpl(url, {
          method: "PUT",
          headers: { ...this.headers(), "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (retryRes.status === 200 || retryRes.status === 201) {
          return { commit_sha: await readCommitSha(retryRes) };
        }
        throw await toError("pushFile.retry", retryRes);
      }
    }
    throw await toError("pushFile", firstRes);
  }

  private async fetchExistingFileSha(
    owner: string,
    name: string,
    path: string,
  ): Promise<string | null> {
    const res = await this.fetchImpl(
      `${this.apiBase}/repos/${owner}/${name}/contents/${encodePath(path)}`,
      { method: "GET", headers: this.headers() },
    );
    if (res.status === 404) return null;
    if (res.status !== 200) {
      throw await toError("pushFile.lookup", res);
    }
    const json = (await res.json().catch(() => null)) as { sha?: unknown } | null;
    if (!json || typeof json.sha !== "string") return null;
    return json.sha;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      accept: ACCEPT_HEADER,
      "x-github-api-version": API_VERSION,
      "user-agent": "learnpro-portfolio/0.1",
    };
  }
}

interface PutContentsBody {
  message: string;
  content: string;
  sha?: string;
}

async function readCommitSha(res: Response): Promise<string> {
  const json = (await res.json().catch(() => null)) as { commit?: { sha?: unknown } } | null;
  const sha = json?.commit?.sha;
  if (typeof sha !== "string" || sha.length === 0) {
    throw new GitHubPortfolioError(
      `GitHub PUT /contents response missing commit.sha`,
      res.status,
      "no commit sha",
    );
  }
  return sha;
}

async function toError(label: string, res: Response): Promise<GitHubPortfolioError> {
  const body = await res.text().catch(() => "");
  const trimmed = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  return new GitHubPortfolioError(`${label} failed (HTTP ${res.status})`, res.status, trimmed);
}

function requireSegment(value: string, label: string): void {
  if (!value || value.trim() === "") {
    throw new Error(`GitHubPortfolioClient: ${label} must be non-empty`);
  }
  if (value.includes("/")) {
    throw new Error(`GitHubPortfolioClient: ${label} must not contain "/"`);
  }
}

// GitHub's contents API expects each path *segment* to be URL-encoded, not the slashes. We
// don't `encodeURIComponent` the whole path because that would also encode the `/` separators.
function encodePath(path: string): string {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

// Cross-runtime base64 — Node's Buffer in node, btoa elsewhere. We intentionally avoid pulling
// in a polyfill: Node 20+ has globalThis.atob/btoa but they don't accept multi-byte strings,
// while Buffer accepts UTF-8 directly.
function encodeBase64(s: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(s, "utf-8").toString("base64");
  }
  // Encode UTF-8 bytes manually before btoa, which expects a binary string.
  const utf8 = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < utf8.length; i++) {
    bin += String.fromCharCode(utf8[i] as number);
  }
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

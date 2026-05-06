import {
  accounts,
  getEpisodeForPush,
  getPortfolioSettings,
  listRecentPushes,
  recordPush,
  updatePortfolioSettings,
  type LearnProDb,
} from "@learnpro/db";
import {
  DEFAULT_REPO_NAME,
  GitHubPortfolioClient,
  GitHubPortfolioError,
  generateReadme,
  problemDirectorySlug,
} from "@learnpro/portfolio";
import type { FastifyInstance, FastifyReply } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { SessionResolver } from "./session.js";

// STORY-040 — portfolio API surface. Five routes, all auth-gated:
//
//   GET    /v1/portfolio/state         — connect status + repo + recent pushes
//   POST   /v1/portfolio/connect-init  — returns the OAuth start URL the UI should navigate to
//   POST   /v1/portfolio/disconnect    — drops the github-portfolio account row
//   POST   /v1/portfolio/push          — generates README, creates dir, commits via the helper
//   PUT    /v1/portfolio/settings      — flips the auto-push toggle / repo name
//
// The `connect-init` route deliberately doesn't redirect; it hands the URL back so the UI can
// open it in the same window after rendering coach-voice context ("we'll request the `repo`
// scope; you can revoke it any time").

const PORTFOLIO_PROVIDER_ID = "github-portfolio";

const PushBodySchema = z.object({
  episode_id: z.string().uuid(),
  edit_readme: z.string().min(1).max(60_000).optional(),
  include_back_link: z.boolean().optional(),
});

const SettingsBodySchema = z.object({
  auto_push: z.boolean().optional(),
  repo: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, "repo must be a GitHub-safe slug")
    .optional(),
});

const REPO_NAME_RE = /^[A-Za-z0-9._-]+$/;

export interface PortfolioRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
  // The web origin the UI lives on — used to build the absolute /api/portfolio/oauth/start URL
  // returned by connect-init. Defaults to NEXTAUTH_URL or http://localhost:3000.
  webBaseUrl?: string;
  // Inject a fake GitHub client constructor in tests so no network ever fires.
  buildClient?: (token: string) => Pick<
    GitHubPortfolioClient,
    "ensureRepoExists" | "pushFile"
  >;
}

export function registerPortfolioRoutes(
  app: FastifyInstance,
  opts: PortfolioRouteOptions,
): void {
  const { db, sessionResolver } = opts;
  const webBaseUrl = (
    opts.webBaseUrl ?? process.env["NEXTAUTH_URL"] ?? "http://localhost:3000"
  ).replace(/\/+$/, "");
  const buildClient =
    opts.buildClient ??
    ((token: string) => new GitHubPortfolioClient({ token }));

  app.get("/v1/portfolio/state", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    const [token, settings, recent] = await Promise.all([
      lookupPortfolioToken(db, session.user_id),
      getPortfolioSettings(db, session.user_id),
      listRecentPushes(db, session.user_id, 20),
    ]);
    return reply.code(200).send({
      connected: !!token,
      repo: settings.github_portfolio_repo ?? DEFAULT_REPO_NAME,
      auto_push: settings.github_auto_push_enabled,
      recent_pushes: recent.map((p) => ({
        id: p.id,
        episode_id: p.episode_id,
        repo_owner: p.repo_owner,
        repo_name: p.repo_name,
        directory_path: p.directory_path,
        commit_sha: p.commit_sha,
        pushed_at: p.pushed_at.toISOString(),
        auto: p.auto,
      })),
    });
  });

  app.post("/v1/portfolio/connect-init", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    return reply
      .code(200)
      .send({ start_url: `${webBaseUrl}/api/portfolio/oauth/start` });
  });

  app.post("/v1/portfolio/disconnect", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const deleted = await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.userId, session.user_id),
          eq(accounts.provider, PORTFOLIO_PROVIDER_ID),
        ),
      )
      .returning({ id: accounts.providerAccountId });
    return reply.code(200).send({ ok: true, deleted: deleted.length });
  });

  app.put("/v1/portfolio/settings", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const parsed = SettingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "invalid_request", issues: parsed.error.issues });
    }
    if (parsed.data.repo === undefined && parsed.data.auto_push === undefined) {
      return reply
        .code(400)
        .send({ error: "invalid_request", message: "at least one field must be set" });
    }
    const out = await updatePortfolioSettings({
      db,
      user_id: session.user_id,
      org_id: session.org_id,
      ...(parsed.data.repo !== undefined && { repo: parsed.data.repo }),
      ...(parsed.data.auto_push !== undefined && { auto_push: parsed.data.auto_push }),
    });
    return reply.code(200).send({
      repo: out.github_portfolio_repo ?? DEFAULT_REPO_NAME,
      auto_push: out.github_auto_push_enabled,
    });
  });

  app.post("/v1/portfolio/push", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    const parsed = PushBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const tokenRow = await lookupPortfolioToken(db, session.user_id);
    if (!tokenRow) {
      return reply.code(409).send({
        error: "not_connected",
        message: "Connect your GitHub portfolio first.",
      });
    }

    const ctx = await getEpisodeForPush(db, parsed.data.episode_id, session.user_id);
    if (!ctx) {
      return reply.code(404).send({ error: "episode_not_found" });
    }
    if (!ctx.submission || !ctx.submission.passed) {
      return reply.code(409).send({
        error: "not_passing",
        message: "Save to portfolio is available once an attempt passes.",
      });
    }

    const settings = await getPortfolioSettings(db, session.user_id);
    const repoName =
      sanitizeRepoName(settings.github_portfolio_repo) ?? DEFAULT_REPO_NAME;
    // The OAuth callback stores GitHub `login` (username) as providerAccountId for this
    // provider, so we can use it directly as the `:owner` URL segment.
    const owner = tokenRow.providerAccountId;

    const directory = problemDirectorySlug({
      slug: ctx.problem.slug,
      track_slug: ctx.track.slug,
    });
    const readmeBody =
      parsed.data.edit_readme ??
      generateReadme({
        problem: {
          name: ctx.problem.name,
          slug: ctx.problem.slug,
          language: ctx.problem.language,
          statement: ctx.problem.statement,
          track_name: ctx.track.name,
          track_slug: ctx.track.slug,
        },
        submission: { code: ctx.submission.code },
        ...(parsed.data.include_back_link !== undefined && {
          include_back_link: parsed.data.include_back_link,
        }),
      });
    const codeFileName = ctx.problem.language === "python" ? "solution.py" : "solution.ts";
    const commitMessage = `Add ${ctx.problem.name} solution`;

    const client = buildClient(tokenRow.access_token);
    let repoCreated: boolean;
    try {
      const ensure = await client.ensureRepoExists(owner, repoName);
      repoCreated = ensure.created;
    } catch (err) {
      return mapPushError(err, reply, "ensure_repo");
    }

    let readmeSha: string;
    let codeSha: string;
    try {
      const r = await client.pushFile(
        owner,
        repoName,
        `${directory}/README.md`,
        readmeBody,
        commitMessage,
      );
      readmeSha = r.commit_sha;
      const c = await client.pushFile(
        owner,
        repoName,
        `${directory}/${codeFileName}`,
        ctx.submission.code,
        commitMessage,
      );
      codeSha = c.commit_sha;
    } catch (err) {
      return mapPushError(err, reply, "push_file");
    }

    const row = await recordPush({
      db,
      user_id: session.user_id,
      org_id: session.org_id,
      episode_id: ctx.episode.id,
      repo_owner: owner,
      repo_name: repoName,
      directory_path: directory,
      commit_sha: codeSha,
      auto: false,
    });

    return reply.code(200).send({
      ok: true,
      repo_created: repoCreated,
      directory_path: directory,
      commit_sha: codeSha,
      readme_commit_sha: readmeSha,
      pushed_at: row.pushed_at.toISOString(),
      html_url: `https://github.com/${owner}/${repoName}/tree/HEAD/${directory}`,
    });
  });
}

function sanitizeRepoName(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!REPO_NAME_RE.test(trimmed)) return null;
  return trimmed;
}

function mapPushError(
  err: unknown,
  reply: FastifyReply,
  stage: "ensure_repo" | "push_file",
) {
  if (err instanceof GitHubPortfolioError) {
    if (err.status === 401 || err.status === 403) {
      return reply.code(403).send({
        error: "github_token_invalid",
        message: "GitHub rejected the access token. Re-connect to refresh it.",
      });
    }
    if (err.status === 404) {
      return reply.code(404).send({
        error: "github_not_found",
        message: "GitHub couldn't find the resource. Try again, or re-connect.",
      });
    }
    return reply
      .code(502)
      .send({ error: `github_${stage}_failed`, message: err.message });
  }
  throw err;
}

interface PortfolioTokenRow {
  access_token: string;
  // GitHub username (login). Stored in `providerAccountId` by the OAuth callback so the push
  // routes can use it directly as the `:owner` URL segment.
  providerAccountId: string;
}

async function lookupPortfolioToken(
  db: LearnProDb,
  user_id: string,
): Promise<PortfolioTokenRow | null> {
  const rows = await db
    .select({
      access_token: accounts.access_token,
      providerAccountId: accounts.providerAccountId,
    })
    .from(accounts)
    .where(
      and(eq(accounts.userId, user_id), eq(accounts.provider, PORTFOLIO_PROVIDER_ID)),
    )
    .limit(1);
  const row = rows[0];
  if (!row || !row.access_token) return null;
  return {
    access_token: row.access_token,
    providerAccountId: row.providerAccountId,
  };
}

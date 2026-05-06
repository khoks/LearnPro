import { and, desc, eq } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import {
  episodes,
  portfolio_pushes,
  problems,
  profiles,
  SELF_HOSTED_ORG_ID,
  submissions,
  tracks,
  type PortfolioPush,
} from "./schema.js";

// STORY-040 — DB helpers for the portfolio-push lifecycle. The route handlers in apps/api stay
// thin; all the SQL lives here.
//
// `recordPush` UPSERTs on the (user_id, episode_id) unique index so re-pushing the same episode
// updates `commit_sha` + `pushed_at` rather than appending a duplicate row.

export interface PortfolioSettings {
  // Sticky preference. Returns null if the row doesn't exist yet — caller falls back to
  // DEFAULT_REPO_NAME. Keeping null distinguishable from the literal default lets the UI
  // display "(default)" beside the input box.
  github_portfolio_repo: string | null;
  github_auto_push_enabled: boolean;
}

export async function getPortfolioSettings(
  db: LearnProDb,
  user_id: string,
): Promise<PortfolioSettings> {
  const rows = await db
    .select({
      repo: profiles.github_portfolio_repo,
      auto: profiles.github_auto_push_enabled,
    })
    .from(profiles)
    .where(eq(profiles.user_id, user_id))
    .limit(1);
  const row = rows[0];
  if (!row) return { github_portfolio_repo: null, github_auto_push_enabled: false };
  return {
    github_portfolio_repo: row.repo,
    github_auto_push_enabled: row.auto,
  };
}

export interface UpdatePortfolioSettingsOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
  repo?: string | null;
  auto_push?: boolean;
}

export async function updatePortfolioSettings(
  opts: UpdatePortfolioSettingsOptions,
): Promise<PortfolioSettings> {
  const update: Record<string, unknown> = { updated_at: new Date() };
  if (opts.repo !== undefined) update["github_portfolio_repo"] = opts.repo;
  if (opts.auto_push !== undefined) update["github_auto_push_enabled"] = opts.auto_push;
  const updated = await opts.db
    .update(profiles)
    .set(update)
    .where(eq(profiles.user_id, opts.user_id))
    .returning({ user_id: profiles.user_id });
  if (updated.length === 0) {
    await opts.db
      .insert(profiles)
      .values({
        user_id: opts.user_id,
        org_id: opts.org_id ?? SELF_HOSTED_ORG_ID,
        github_portfolio_repo: opts.repo ?? null,
        github_auto_push_enabled: opts.auto_push ?? false,
      })
      .onConflictDoNothing();
    if (opts.repo !== undefined || opts.auto_push !== undefined) {
      await opts.db
        .update(profiles)
        .set(update)
        .where(eq(profiles.user_id, opts.user_id))
        .returning({ user_id: profiles.user_id });
    }
  }
  return getPortfolioSettings(opts.db, opts.user_id);
}

export interface RecordPushInput {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
  episode_id: string;
  repo_owner: string;
  repo_name: string;
  directory_path: string;
  commit_sha: string;
  auto: boolean;
}

export async function recordPush(opts: RecordPushInput): Promise<PortfolioPush> {
  const now = new Date();
  const rows = await opts.db
    .insert(portfolio_pushes)
    .values({
      user_id: opts.user_id,
      org_id: opts.org_id ?? SELF_HOSTED_ORG_ID,
      episode_id: opts.episode_id,
      repo_owner: opts.repo_owner,
      repo_name: opts.repo_name,
      directory_path: opts.directory_path,
      commit_sha: opts.commit_sha,
      pushed_at: now,
      auto: opts.auto,
    })
    .onConflictDoUpdate({
      target: [portfolio_pushes.user_id, portfolio_pushes.episode_id],
      set: {
        repo_owner: opts.repo_owner,
        repo_name: opts.repo_name,
        directory_path: opts.directory_path,
        commit_sha: opts.commit_sha,
        pushed_at: now,
        auto: opts.auto,
      },
    })
    .returning();
  if (!rows[0]) {
    throw new Error("recordPush: insert/update returned no rows");
  }
  return rows[0];
}

export async function listRecentPushes(
  db: LearnProDb,
  user_id: string,
  limit = 20,
): Promise<PortfolioPush[]> {
  return db
    .select()
    .from(portfolio_pushes)
    .where(eq(portfolio_pushes.user_id, user_id))
    .orderBy(desc(portfolio_pushes.pushed_at))
    .limit(limit);
}

export interface PortfolioEpisodeContext {
  episode: {
    id: string;
    user_id: string;
    problem_id: string;
    final_outcome: string | null;
  };
  problem: {
    id: string;
    name: string;
    slug: string;
    statement: string;
    language: "python" | "typescript";
  };
  track: {
    name: string;
    slug: string;
  };
  submission: {
    code: string;
    passed: boolean;
  } | null;
}

// Joined lookup that powers POST /v1/portfolio/push. We need everything in one place:
//  - the episode (so we can verify the user owns it)
//  - the problem (so we can build the README + directory path)
//  - the parent track (for the directory's first segment)
//  - the most-recent submission (so we can render the user's code in the README)
//
// Returns null when the episode doesn't exist or doesn't belong to the user — the route
// translates that to 404. The SQL keeps "user owns episode" inside the WHERE so a stolen
// episode_id in a request body can never leak someone else's code.
export async function getEpisodeForPush(
  db: LearnProDb,
  episode_id: string,
  user_id: string,
): Promise<PortfolioEpisodeContext | null> {
  const rows = await db
    .select({
      episode_id: episodes.id,
      episode_user_id: episodes.user_id,
      episode_problem_id: episodes.problem_id,
      final_outcome: episodes.final_outcome,
      problem_id: problems.id,
      problem_name: problems.name,
      problem_slug: problems.slug,
      problem_statement: problems.statement,
      problem_language: problems.language,
      track_name: tracks.name,
      track_slug: tracks.slug,
    })
    .from(episodes)
    .innerJoin(problems, eq(problems.id, episodes.problem_id))
    .innerJoin(tracks, eq(tracks.id, problems.track_id))
    .where(and(eq(episodes.id, episode_id), eq(episodes.user_id, user_id)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const subRows = await db
    .select({ code: submissions.code, passed: submissions.passed })
    .from(submissions)
    .where(eq(submissions.episode_id, episode_id))
    .orderBy(desc(submissions.submitted_at))
    .limit(1);
  const sub = subRows[0] ?? null;

  return {
    episode: {
      id: row.episode_id,
      user_id: row.episode_user_id,
      problem_id: row.episode_problem_id,
      final_outcome: row.final_outcome,
    },
    problem: {
      id: row.problem_id,
      name: row.problem_name,
      slug: row.problem_slug,
      statement: row.problem_statement,
      language: row.problem_language,
    },
    track: {
      name: row.track_name,
      slug: row.track_slug,
    },
    submission: sub ? { code: sub.code, passed: sub.passed } : null,
  };
}

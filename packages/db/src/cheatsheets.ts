import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { LearnProDb } from "./client.js";
import { cheatsheets, SELF_HOSTED_ORG_ID, type Cheatsheet } from "./schema.js";

// STORY-041 — DB helpers for the personal cheatsheet table. The pure cheatsheet agent lives in
// @learnpro/agent; the route handlers in apps/api stay thin and call into these helpers. The
// jsonb columns round-trip through Zod so reads from the DB are validated before they leave
// the boundary.

export const CheatsheetEntrySchema = z.object({
  concept: z.string().min(1).max(120),
  definition: z.string().min(1).max(400),
  code_example: z.string().min(1).max(600),
  gotcha: z.string().min(1).max(400),
});
export type CheatsheetEntry = z.infer<typeof CheatsheetEntrySchema>;

export const CheatsheetEntriesSchema = z.array(CheatsheetEntrySchema).max(6);

export const CheatsheetEpisodesCoveredSchema = z.array(z.string().uuid()).min(1).max(50);

export interface CheatsheetView {
  id: string;
  user_id: string;
  org_id: string;
  episodes_covered: string[];
  entries: CheatsheetEntry[];
  markdown_content: string;
  created_at: Date;
  updated_at: Date;
}

function toView(row: Cheatsheet): CheatsheetView {
  const entries = CheatsheetEntriesSchema.parse(row.entries);
  const episodes_covered = CheatsheetEpisodesCoveredSchema.parse(row.episodes_covered);
  return {
    id: row.id,
    user_id: row.user_id,
    org_id: row.org_id,
    episodes_covered,
    entries,
    markdown_content: row.markdown_content,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface CreateCheatsheetInput {
  user_id: string;
  org_id?: string;
  episodes_covered: ReadonlyArray<string>;
  entries: ReadonlyArray<CheatsheetEntry>;
  markdown_content: string;
  now?: Date;
}

export async function createCheatsheet(
  db: LearnProDb,
  input: CreateCheatsheetInput,
): Promise<CheatsheetView> {
  const now = input.now ?? new Date();
  // Validate before insert — boundary discipline. Empty entries are allowed (best-effort
  // fallback when the LLM produced nothing usable); the route surfaces a friendly empty state
  // in that case.
  const entries = z.array(CheatsheetEntrySchema).max(6).parse(input.entries);
  const episodes_covered = CheatsheetEpisodesCoveredSchema.parse(input.episodes_covered);
  const inserted = await db
    .insert(cheatsheets)
    .values({
      org_id: input.org_id ?? SELF_HOSTED_ORG_ID,
      user_id: input.user_id,
      episodes_covered,
      entries,
      markdown_content: input.markdown_content,
      created_at: now,
      updated_at: now,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("createCheatsheet: insert returned no row");
  return toView(row);
}

export interface ListCheatsheetsOptions {
  user_id: string;
  limit?: number;
  offset?: number;
}

// Page through a user's cheatsheet history. Returns the most recent first.
export async function listCheatsheetsForUser(
  db: LearnProDb,
  opts: ListCheatsheetsOptions,
): Promise<CheatsheetView[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const rows = await db
    .select()
    .from(cheatsheets)
    .where(eq(cheatsheets.user_id, opts.user_id))
    .orderBy(desc(cheatsheets.created_at))
    .limit(limit)
    .offset(offset);
  return rows.map(toView);
}

// Returns null when the row doesn't exist or doesn't belong to the user — the route translates
// to 404. Keeping the user-id check inside the WHERE means a stolen cheatsheet_id in a request
// can never leak someone else's data.
export async function getCheatsheetForUser(
  db: LearnProDb,
  cheatsheet_id: string,
  user_id: string,
): Promise<CheatsheetView | null> {
  const rows = await db
    .select()
    .from(cheatsheets)
    .where(and(eq(cheatsheets.id, cheatsheet_id), eq(cheatsheets.user_id, user_id)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return toView(row);
}

export interface UpdateCheatsheetMarkdownOptions {
  user_id: string;
  cheatsheet_id: string;
  markdown_content: string;
  now?: Date;
}

// Idempotent partial update of `markdown_content`. Returns the updated view, or null when the
// row doesn't exist or doesn't belong to the user.
export async function updateCheatsheetMarkdown(
  db: LearnProDb,
  opts: UpdateCheatsheetMarkdownOptions,
): Promise<CheatsheetView | null> {
  const now = opts.now ?? new Date();
  const updated = await db
    .update(cheatsheets)
    .set({ markdown_content: opts.markdown_content, updated_at: now })
    .where(and(eq(cheatsheets.id, opts.cheatsheet_id), eq(cheatsheets.user_id, opts.user_id)))
    .returning();
  const row = updated[0];
  if (!row) return null;
  return toView(row);
}

// "Has this user already had a cheatsheet generated covering this exact set of episodes?"
// Used by the cron trigger so a re-run doesn't double-generate. The match is exact set
// equivalence — different episode ordering still matches because we canonicalise the input.
export async function findCheatsheetForEpisodes(
  db: LearnProDb,
  user_id: string,
  episode_ids: ReadonlyArray<string>,
): Promise<CheatsheetView | null> {
  if (episode_ids.length === 0) return null;
  const sorted = [...episode_ids].sort();
  const rows = await db
    .select()
    .from(cheatsheets)
    .where(
      and(
        eq(cheatsheets.user_id, user_id),
        // Postgres jsonb equality after sorting both sides — the seed below sorts the `episode_ids`
        // input, and `createCheatsheet` stores them as-given so the cron trigger always passes
        // the canonical sorted form when checking before insert. That keeps the equality cheap.
        sql`${cheatsheets.episodes_covered} = ${JSON.stringify(sorted)}::jsonb`,
      ),
    )
    .orderBy(desc(cheatsheets.created_at))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return toView(row);
}

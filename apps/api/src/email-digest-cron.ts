import {
  listDigestRecipients,
  listFinishedEpisodesInWindow,
  listSkillSnapshot,
  type DigestEpisodeRow,
  type DigestRecipient,
  type DigestSkillSnapshotRow,
  type LearnProDb,
} from "@learnpro/db";
import {
  buildDailyDigest,
  buildWeeklyDigest,
  type DailyDigestEpisode,
  type DailyDigestPlanItem,
  type WeeklyDigestEpisode,
  type WeeklyDigestMasteryDelta,
  type WeeklyDigestSkillSnapshotRow,
} from "@learnpro/notifications/email";
import { type NotificationDispatcher, type QuietHoursDispatcher } from "@learnpro/notifications";

// STORY-045 — Glue between the digest builders, the DB reads, and the dispatcher. The cron
// callers (daily-reminder.ts extension + weekly-digest.ts) wrap the per-user iteration; this
// module supplies the per-user dispatch shape.

export interface EmailDigestCronCommonOptions {
  db: LearnProDb;
  dispatcher: NotificationDispatcher | QuietHoursDispatcher;
  // Absolute base URL for the unsubscribe link. Defaults to `https://learnpro.local`.
  unsubscribeBaseUrl?: string;
  now?: Date;
}

export interface DailyDigestDispatchInput extends EmailDigestCronCommonOptions {
  // Optional adapter to look up today's pending session-plan items. When omitted the digest is
  // sent without the "Today's plan" section. Production wires this to STORY-015's session_plans
  // helper.
  getTodayPlanItems?: (user_id: string, now: Date) => Promise<DailyDigestPlanItem[]>;
  // Optional difficulty hint adapter; null when no hint applies.
  getDifficultyHint?: (user_id: string, now: Date) => Promise<string | null>;
  // Display-name lookup; null when the user hasn't set one (the digest falls back to "Hi there,").
  getUserName?: (user_id: string) => Promise<string | null>;
}

export interface DailyDigestRunOutcome {
  user_id: string;
  email: string;
  any_delivered: boolean;
  per_channel: Array<{ channel: string; delivered: boolean; reason?: string }>;
}

// Iterates every recipient with `email_daily_opt_in=true`, builds a per-user digest from
// yesterday's episodes + today's plan, and dispatches the rendered html/text through the
// EmailChannel only (the channels filter excludes the bell-icon row + Web Push from this path).
export async function runDailyEmailDigest(
  opts: DailyDigestDispatchInput,
): Promise<DailyDigestRunOutcome[]> {
  const now = opts.now ?? new Date();
  const recipients = await listDigestRecipients(opts.db, "daily");
  const baseUrl = opts.unsubscribeBaseUrl ?? "https://learnpro.local";

  const outcomes: DailyDigestRunOutcome[] = [];
  for (const r of recipients) {
    const yesterday = startOfUtcDay(addDays(now, -1));
    const todayStart = startOfUtcDay(now);
    const episodes = await listFinishedEpisodesInWindow(opts.db, r.user_id, yesterday, todayStart);
    const planItems = opts.getTodayPlanItems ? await opts.getTodayPlanItems(r.user_id, now) : [];
    const difficultyHint = opts.getDifficultyHint
      ? await opts.getDifficultyHint(r.user_id, now)
      : null;
    const userName = opts.getUserName ? await opts.getUserName(r.user_id) : null;

    const rendered = buildDailyDigest({
      user_name: userName,
      yesterday_label: isoDate(yesterday),
      today_label: isoDate(todayStart),
      yesterday_episodes: episodes.map(toDailyEpisode),
      today_plan_items: planItems,
      difficulty_hint: difficultyHint,
      unsubscribe_url: unsubscribeUrl(baseUrl, r.unsubscribe_token),
    });

    const result = await opts.dispatcher.dispatch(
      {
        user_id: r.user_id,
        title: rendered.subject,
        dedupe_key: dailyEmailDedupeKey(now),
        metadata: emailMetadata({ recipient: r, baseUrl, rendered }),
      },
      { now, channels: ["email"] },
    );
    outcomes.push({
      user_id: r.user_id,
      email: r.email,
      any_delivered: result.any_delivered,
      per_channel: result.results.map((res) => ({
        channel: res.channel,
        delivered: res.delivered,
        ...(res.reason !== undefined && { reason: res.reason }),
      })),
    });
  }
  return outcomes;
}

export interface WeeklyDigestDispatchInput extends EmailDigestCronCommonOptions {
  getMasteryDeltas?: (
    user_id: string,
    weekStart: Date,
    weekEnd: Date,
  ) => Promise<WeeklyDigestMasteryDelta[]>;
  getNextStepHint?: (user_id: string, now: Date) => Promise<string | null>;
  getUserName?: (user_id: string) => Promise<string | null>;
}

export interface WeeklyDigestRunOutcome {
  user_id: string;
  email: string;
  any_delivered: boolean;
  per_channel: Array<{ channel: string; delivered: boolean; reason?: string }>;
}

export async function runWeeklyEmailDigest(
  opts: WeeklyDigestDispatchInput,
): Promise<WeeklyDigestRunOutcome[]> {
  const now = opts.now ?? new Date();
  const recipients = await listDigestRecipients(opts.db, "weekly");
  const baseUrl = opts.unsubscribeBaseUrl ?? "https://learnpro.local";
  // Filter recipients whose preferred weekday matches today's ISO weekday (1=Mon … 7=Sun).
  const todayDow = isoDayOfWeek(now);
  const eligible = recipients.filter((r) => r.weekly_day_of_week === todayDow);

  const outcomes: WeeklyDigestRunOutcome[] = [];
  for (const r of eligible) {
    const weekEnd = startOfUtcDay(now);
    const weekStart = addDays(weekEnd, -7);
    const episodes = await listFinishedEpisodesInWindow(opts.db, r.user_id, weekStart, weekEnd);
    const skillSnapshot = await listSkillSnapshot(opts.db, r.user_id);
    const masteryDeltas = opts.getMasteryDeltas
      ? await opts.getMasteryDeltas(r.user_id, weekStart, weekEnd)
      : [];
    const nextStepHint = opts.getNextStepHint ? await opts.getNextStepHint(r.user_id, now) : null;
    const userName = opts.getUserName ? await opts.getUserName(r.user_id) : null;

    const hoursPracticed = sumHours(episodes);
    const rendered = buildWeeklyDigest({
      user_name: userName,
      week_start_label: isoDate(weekStart),
      week_end_label: isoDate(addDays(weekEnd, -1)),
      week_episodes: episodes.map(toWeeklyEpisode),
      mastery_deltas: masteryDeltas,
      skill_snapshot: skillSnapshot.map(toWeeklySkillSnapshot),
      hours_practiced: hoursPracticed,
      next_step_hint: nextStepHint,
      unsubscribe_url: unsubscribeUrl(baseUrl, r.unsubscribe_token),
    });

    const result = await opts.dispatcher.dispatch(
      {
        user_id: r.user_id,
        title: rendered.subject,
        dedupe_key: weeklyEmailDedupeKey(now),
        metadata: emailMetadata({ recipient: r, baseUrl, rendered }),
      },
      { now, channels: ["email"] },
    );
    outcomes.push({
      user_id: r.user_id,
      email: r.email,
      any_delivered: result.any_delivered,
      per_channel: result.results.map((res) => ({
        channel: res.channel,
        delivered: res.delivered,
        ...(res.reason !== undefined && { reason: res.reason }),
      })),
    });
  }
  return outcomes;
}

interface MetadataInput {
  recipient: DigestRecipient;
  baseUrl: string;
  rendered: { html: string; text: string };
}

function emailMetadata(input: MetadataInput): Record<string, unknown> {
  const link = unsubscribeUrl(input.baseUrl, input.recipient.unsubscribe_token);
  return {
    email_to: input.recipient.email,
    email_html: input.rendered.html,
    email_text: input.rendered.text,
    email_headers: {
      "List-Unsubscribe": `<${link}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

function unsubscribeUrl(baseUrl: string, token: string): string {
  const url = new URL("/v1/email/unsubscribe", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function toDailyEpisode(row: DigestEpisodeRow): DailyDigestEpisode {
  return {
    problem_slug: row.problem_slug,
    problem_name: row.problem_name,
    final_outcome: row.final_outcome,
    hints_used: row.hints_used,
    time_to_solve_ms: row.time_to_solve_ms,
  };
}

function toWeeklyEpisode(row: DigestEpisodeRow): WeeklyDigestEpisode {
  return {
    problem_slug: row.problem_slug,
    problem_name: row.problem_name,
    final_outcome: row.final_outcome,
    hints_used: row.hints_used,
    time_to_solve_ms: row.time_to_solve_ms,
  };
}

function toWeeklySkillSnapshot(row: DigestSkillSnapshotRow): WeeklyDigestSkillSnapshotRow {
  return {
    concept_name: row.concept_name,
    confidence: row.confidence,
  };
}

function sumHours(episodes: ReadonlyArray<DigestEpisodeRow>): number {
  const ms = episodes.reduce((acc, e) => acc + (e.time_to_solve_ms ?? 0), 0);
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDayOfWeek(d: Date): number {
  // JS getUTCDay: 0=Sun … 6=Sat. ISO 8601: 1=Mon … 7=Sun.
  const dow = d.getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function dailyEmailDedupeKey(now: Date): string {
  return `email-daily-${isoDate(now)}`;
}

export function weeklyEmailDedupeKey(now: Date): string {
  return `email-weekly-${isoDate(now)}`;
}

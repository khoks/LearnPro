import { z } from "zod";

// Streak computation for STORY-022. Pure — no DB access. Caller hands us the sorted-descending
// list of UTC dates on which the user closed at least one episode, plus today and the user's
// remaining grace-day budget; we return the streak length in days, how many grace days were
// consumed during this walk, and how many remain.
//
// Anti-dark-pattern stance (EPIC-011 non-negotiable): no shame, no urgency, no "DON'T LOSE".
// The data this function returns drives a coach-voice copy in the dashboard — no copy lives in
// this file. See `docs/product/UX_DETAILS.md § EPIC-011` for the rationale.

export const StreakPolicyConfigSchema = z.object({
  // Replenished to this value on day 1 of each UTC month (lazy refill via
  // `replenishGraceDays()` in @learnpro/db). 2 is the EPIC-011 locked default ("Duolingo-style
  // streak shield, given for free, not paid").
  monthly_grace_days: z.number().int().min(0).default(2),
});
export type StreakPolicyConfig = z.infer<typeof StreakPolicyConfigSchema>;

export const DEFAULT_STREAK_POLICY: StreakPolicyConfig = StreakPolicyConfigSchema.parse({});

export interface ComputeStreakInput {
  // Sorted descending. UTC dates only — caller normalizes the timezone before passing.
  episodeDays: Date[];
  today: Date;
  graceDaysRemaining: number;
}

export interface ComputeStreakResult {
  streakDays: number;
  graceDaysUsed: number;
  graceDaysRemaining: number;
}

// Walks back from today, counting consecutive UTC days that either had an episode close OR were
// covered by an available grace day. Stops the moment a missed day would need more grace than
// the user has left, AND treats the current run as broken (streak = 0) if no real episode day
// is ever reached — graces alone cannot manufacture a streak.
//
// Today itself is special: if the user hasn't practiced today yet, we don't penalize the
// in-progress day — the walk just starts from yesterday. (Most learners hit the dashboard
// before they practice; the streak number should reflect their committed history, not "today is
// incomplete".)
//
// Future-dated episode days are ignored (defensive against clock skew). Multiple episodes on
// the same UTC day collapse to one (set semantics).
export function computeStreak(input: ComputeStreakInput): ComputeStreakResult {
  const todayKey = utcDayKey(input.today);
  // Filter out future days so a clock-skewed episode doesn't inflate the streak.
  const dayKeys = new Set(input.episodeDays.filter((d) => utcDayKey(d) <= todayKey).map(utcDayKey));

  if (dayKeys.size === 0) {
    return { streakDays: 0, graceDaysUsed: 0, graceDaysRemaining: input.graceDaysRemaining };
  }

  const startedToday = dayKeys.has(todayKey);
  let cursor = startedToday ? new Date(input.today) : addUtcDays(input.today, -1);
  let streakDays = 0;
  let pendingGraces = 0;
  let graceUsed = 0;
  let graceRemaining = input.graceDaysRemaining;

  // Walk back day-by-day. We can keep extending the run by burning graces, but we only "commit"
  // those graces (and bake the bridge into streakDays) when we land on the next real episode
  // day. If we never reach a real day before the grace budget runs out, the trailing graces
  // unwind and the streak ends at the last confirmed run.
  while (true) {
    const key = utcDayKey(cursor);
    if (dayKeys.has(key)) {
      streakDays += 1 + pendingGraces;
      graceUsed += pendingGraces;
      graceRemaining -= pendingGraces;
      pendingGraces = 0;
      cursor = addUtcDays(cursor, -1);
      continue;
    }
    if (graceRemaining - pendingGraces > 0) {
      pendingGraces += 1;
      cursor = addUtcDays(cursor, -1);
      continue;
    }
    break;
  }

  return { streakDays, graceDaysUsed: graceUsed, graceDaysRemaining: graceRemaining };
}

// Returns true when `lastReplenishedAt` falls in a strictly earlier UTC month than `now`, OR
// is null/undefined (i.e., the user has never been replenished). The DB helper uses this to
// decide whether to top the counter back up to `monthly_grace_days`.
export function shouldReplenishGrace(
  lastReplenishedAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!lastReplenishedAt) return true;
  const lastYear = lastReplenishedAt.getUTCFullYear();
  const lastMonth = lastReplenishedAt.getUTCMonth();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  if (nowYear > lastYear) return true;
  if (nowYear === lastYear && nowMonth > lastMonth) return true;
  return false;
}

// "YYYY-MM-DD" in UTC. Stable string comparison + cheap Set lookup.
export function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addUtcDays(d: Date, deltaDays: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + deltaDays));
}

import { z } from "zod";

// STORY-024 — pure quiet-hours policy. Two pure functions + a Zod-validated config shape.
// Used by the dispatcher's `shouldDeliverNow()` hook (via the `dispatcherWithQuietHours` factory)
// and by the deferred-notification flusher to compute `deliver_after`.
//
// Design notes:
// - Times are stored as **minutes-from-midnight in the user's local timezone** (not UTC). The
//   user picks 22:00 / 08:00 in their head; we convert their local clock to UTC at delivery time
//   using the IANA `timezone` field. Storing offsets directly would silently break across DST
//   transitions.
// - The window is half-open `[start_min, end_min)` so the boundary `end_min` itself is *outside*
//   quiet hours — at exactly 08:00:00 the dispatcher is allowed to deliver.
// - `start > end` ⇒ window crosses midnight (the common case: 22:00–08:00). `start === end` is
//   rejected by the schema (a zero-width window is meaningless and likely a UI bug).

const MINUTES_IN_DAY = 24 * 60;

export const QuietHoursConfigSchema = z
  .object({
    enabled: z.boolean(),
    start_min: z
      .number()
      .int()
      .min(0)
      .max(MINUTES_IN_DAY - 1),
    end_min: z
      .number()
      .int()
      .min(0)
      .max(MINUTES_IN_DAY - 1),
    timezone: z.string().min(1).max(64),
  })
  .refine((c) => c.start_min !== c.end_min, {
    message: "start_min must differ from end_min — a zero-width quiet window is invalid",
    path: ["end_min"],
  })
  .refine((c) => isValidTimeZone(c.timezone), {
    message: "timezone must be a valid IANA zone (e.g. 'America/Los_Angeles', 'UTC')",
    path: ["timezone"],
  });

export type QuietHoursConfig = z.infer<typeof QuietHoursConfigSchema>;

export const DEFAULT_QUIET_HOURS_CONFIG: QuietHoursConfig = {
  enabled: true,
  start_min: 22 * 60,
  end_min: 8 * 60,
  timezone: "UTC",
};

export interface IsInQuietHoursInput {
  config: QuietHoursConfig;
  now: Date;
}

// Returns true when `now` (mapped into the user's local timezone) falls inside the quiet window.
// Returns false when `enabled === false` or when `now` is outside the window.
export function isInQuietHours(input: IsInQuietHoursInput): boolean {
  if (!input.config.enabled) return false;
  const local = localMinutesFromMidnight(input.now, input.config.timezone);
  return inWindow(local, input.config.start_min, input.config.end_min);
}

export interface NextDeliveryTimeInput {
  config: QuietHoursConfig;
  now: Date;
}

// Returns the first millisecond at or after `now` when delivery is allowed. When `enabled` is
// false or `now` is outside the window, returns `now` unchanged.
//
// When `now` is inside the window, walks forward minute-by-minute (cheap; at most one day) to find
// the first local-minute boundary that exits the window, then returns the corresponding UTC Date.
// We walk because DST transitions mean "add (end_min - start_min) minutes" can land in the wrong
// place — the safe answer is "find the first instant whose local-minutes are at end_min".
export function nextDeliveryTime(input: NextDeliveryTimeInput): Date {
  if (!isInQuietHours(input)) return input.now;
  const tz = input.config.timezone;
  // Step in 1-minute increments from `now` until we land outside the quiet window. The bound
  // (24*60 + 60) gives us a full day plus a one-hour safety margin for DST forward-spring days.
  const stepMs = 60 * 1000;
  for (let i = 1; i <= MINUTES_IN_DAY + 60; i++) {
    const candidate = new Date(input.now.getTime() + i * stepMs);
    const local = localMinutesFromMidnight(candidate, tz);
    if (!inWindow(local, input.config.start_min, input.config.end_min)) {
      // Found the first minute outside the window. Snap back to the second boundary so the
      // returned timestamp is aligned to the start-of-minute.
      return new Date(Math.floor(candidate.getTime() / 1000) * 1000);
    }
  }
  // Should be unreachable — a 24-hour walk always exits a non-zero-width window.
  return new Date(input.now.getTime() + MINUTES_IN_DAY * stepMs);
}

// `local_min ∈ [0, 1440)` ; window is half-open `[start, end)`. When `start < end`, the window
// is a contiguous slice within one local day. When `start > end`, the window wraps midnight, so
// "in the window" means "≥ start OR < end".
function inWindow(local_min: number, start: number, end: number): boolean {
  if (start === end) return false; // schema rejects this, but be defensive
  if (start < end) return local_min >= start && local_min < end;
  return local_min >= start || local_min < end;
}

// Converts an instant to "minutes since local-midnight in `timezone`" using `Intl.DateTimeFormat`
// — the only DST-correct way to map UTC → local without dragging in a tz library.
//
// We ask for a 24h H + m formatted string in the target timezone, parse the integers back out,
// and compute hour*60 + minute.
function localMinutesFromMidnight(instant: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "hour") hour = Number.parseInt(p.value, 10);
    else if (p.type === "minute") minute = Number.parseInt(p.value, 10);
  }
  // Intl in some locales returns "24" for midnight; normalize to 0.
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

// Cheap pre-flight on the timezone string. Building an `Intl.DateTimeFormat` with an unknown zone
// throws a RangeError — we catch it and surface a friendlier message via the schema refinement.
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

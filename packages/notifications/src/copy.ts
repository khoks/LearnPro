// STORY-023 — daily-reminder + test-push copy. EPIC-011 anti-dark-pattern stance:
// no urgency, no shame, no loss-aversion, no fire emoji, no "DON'T LOSE", no "DAY X", no "burn".
// `notifications-copy.test.ts` greps for the forbidden set; if any of these phrases sneak in,
// the test fails.

export const DAILY_REMINDER_TITLE = "Time to practice";

export const DAILY_REMINDER_BODY = "A short session keeps your reps warm. Whenever you're ready.";

export const TEST_PUSH_TITLE = "Push is working";

export const TEST_PUSH_BODY = "Hello from LearnPro — browser notifications are set up.";

// Used by the daily-reminder cron to build a per-day idempotency key. UTC date so two cron
// fires within the same UTC day collapse to one delivered notification.
export function dailyDedupeKey(now: Date): string {
  const yyyy = now.getUTCFullYear().toString().padStart(4, "0");
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = now.getUTCDate().toString().padStart(2, "0");
  return `daily-${yyyy}${mm}${dd}`;
}

// Centralized forbidden-phrase list so the test can import it and any new copy can be checked
// against the same allow-list. Plain strings + emoji codepoints — case-insensitive on the
// alphabetic ones.
export const FORBIDDEN_PHRASES = ["DON'T LOSE", "DAY X", "burn", "BURN", "🔥", "⚠️"] as const;

export function containsForbiddenPhrase(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (phrase === "🔥" || phrase === "⚠️" || phrase === "DAY X" || phrase === "DON'T LOSE") {
      // Emoji + literal-uppercase ones must match exactly (DON'T LOSE / DAY X / 🔥 / ⚠️).
      if (text.includes(phrase)) return phrase;
    } else {
      // case-insensitive for "burn" so "burnstreak" / "Burn" both fail.
      if (lower.includes(phrase.toLowerCase())) return phrase;
    }
  }
  return null;
}

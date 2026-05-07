// STORY-045 — Email digest copy. Same coach-voice rules as STORY-023's daily-reminder copy:
// no urgency / no shame / no FOMO / no fire emoji / no "DON'T LOSE" / no "DAY X" / no "burn".
// Forbidden phrases enforced by `digests/copy.test.ts` against the rendered subject + html +
// text of every digest variant (empty / single-episode / typical / perfect-week).
//
// All public copy strings live here so the forbidden-phrase test can scan them without depending
// on a digest's data shape.

export const DAILY_DIGEST_SUBJECT = "Your daily LearnPro digest";

export const WEEKLY_DIGEST_SUBJECT = "Your weekly LearnPro digest";

// Friendly footer + unsubscribe wording. Rendered into both HTML and text variants.
export const UNSUBSCRIBE_FOOTER =
  "You're getting this because you opted into LearnPro digest emails.";

export const UNSUBSCRIBE_LINK_TEXT = "Unsubscribe";

// Unsubscribe-success page rendered by the GET /v1/email/unsubscribe route.
export const UNSUBSCRIBE_SUCCESS_TITLE = "You're unsubscribed";
export const UNSUBSCRIBE_SUCCESS_BODY =
  "You won't get further LearnPro digest emails. You can re-enable them any time from your settings.";
export const UNSUBSCRIBE_UNKNOWN_TITLE = "Already unsubscribed";
export const UNSUBSCRIBE_UNKNOWN_BODY =
  "This unsubscribe link is no longer active. If you'd like to update your email preferences, sign in and visit your settings.";

// Empty-state body used when there are zero finished episodes in the digest window. The copy
// must not shame; it frames the empty window as a fresh start.
export const EMPTY_DAILY_BODY =
  "No problems closed yesterday — that's fine. Here's what's queued for today whenever you're ready.";

export const EMPTY_WEEKLY_BODY =
  "Quiet week — that happens. Whenever you next have time, your queue is waiting.";

// The forbidden-phrase set the digest copy test scans for. Imported from the main copy module
// so we share STORY-023's set verbatim. We re-export here to keep the import surface small.
export { containsForbiddenPhrase, FORBIDDEN_PHRASES } from "../src/copy.js";

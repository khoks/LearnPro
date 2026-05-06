// STORY-056 — coach-voice copy for the /settings/data view. EPIC-011 anti-dark-pattern stance:
// no urgency, no shame, no pressure tactics. The voice is calm, clear, and respects the user's
// agency over their own data.
//
// `notifications-copy.test.ts` enforces a forbidden-phrase list across notifications strings;
// the equivalent test here is `copy.test.ts` next to this file.

export const PAGE_TITLE = "Your data";

export const PAGE_INTRO =
  "Here's what we have on file. You can review your history, remove your voice transcripts, or close your account at any time.";

export const SUMMARY_HEADING = "What's stored";

export const VOICE_SECTION_TITLE = "Voice transcripts";

export const VOICE_SECTION_BODY =
  "Voice transcripts are kept for 30 days by default and removed automatically. If you'd like to clear them now, that's fine — it won't affect your progress.";

export const VOICE_DELETE_BUTTON = "Remove my voice transcripts";

export const VOICE_DELETE_CONFIRM_TITLE = "Remove voice transcripts?";

export const VOICE_DELETE_CONFIRM_BODY =
  "This removes the recordings we have on file for you. Your XP, streak, and progress stay exactly as they are.";

export const VOICE_DELETE_CONFIRM_ACTION = "Yes, remove";

export const VOICE_DELETE_CONFIRM_CANCEL = "Keep them";

export const VOICE_DELETE_DONE_NONE = "No voice transcripts on file.";

export const VOICE_DELETE_DONE_TEMPLATE = (n: number): string =>
  n === 1 ? "Removed 1 voice transcript." : `Removed ${n} voice transcripts.`;

export const ACCOUNT_SECTION_TITLE = "Close your account";

export const ACCOUNT_SECTION_BODY =
  "Closing your account removes everything we have on you and signs you out. If you change your mind later, you can sign up again from scratch.";

export const ACCOUNT_DELETE_BUTTON = "Close my account";

export const ACCOUNT_DELETE_CONFIRM_TITLE = "Close your account?";

export const ACCOUNT_DELETE_CONFIRM_BODY_1 =
  "This removes your profile, your episodes, your skill scores, and every interaction we've recorded. We can't bring it back afterwards.";

export const ACCOUNT_DELETE_CONFIRM_BODY_2 =
  "If you'd rather take a break, you can just sign out — your data will still be here when you return.";

export const ACCOUNT_DELETE_CONFIRM_ACTION_TYPE_HERE = "Type DELETE to confirm";

export const ACCOUNT_DELETE_CONFIRM_ACTION = "Close my account";

export const ACCOUNT_DELETE_CONFIRM_CANCEL = "Take me back";

// Forbidden-phrase list mirrors the anti-dark-pattern checks from STORY-023's notifications copy.
// Anything that creates artificial urgency or shame is out.
export const FORBIDDEN_PHRASES = [
  "DON'T",
  "WARNING",
  "you'll lose",
  "lose all",
  "permanently",
  "irreversible",
  "no way back",
  "🔥",
  "⚠️",
] as const;

export function containsForbiddenPhrase(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (phrase === "🔥" || phrase === "⚠️") {
      if (text.includes(phrase)) return phrase;
    } else if (phrase === "DON'T" || phrase === "WARNING") {
      if (text.includes(phrase)) return phrase;
    } else if (lower.includes(phrase.toLowerCase())) {
      return phrase;
    }
  }
  return null;
}

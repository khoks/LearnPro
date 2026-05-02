import {
  MAX_ONBOARDING_TURNS,
  OnboardingTurnResponseSchema,
  type OnboardingMessage,
  type OnboardingTurnResponse,
} from "@learnpro/shared";

// Shared state-machine helpers for the onboarding chat client. Pulled out into a pure module so
// they're testable without React Testing Library setup. The component just composes these.

export const SEED_GREETING: OnboardingMessage = {
  role: "assistant",
  content:
    "Welcome! I'll ask a few quick questions to set up your learning plan. What kind of role are you preparing for?",
};

export const SKIP_USER_MESSAGE = "I'd rather start now.";

// Append a user message + start the request payload that hits /api/onboarding/turn.
export function appendUserMessage(
  history: OnboardingMessage[],
  text: string,
): OnboardingMessage[] {
  const trimmed = text.trim();
  if (!trimmed) return history;
  return [...history, { role: "user", content: trimmed }];
}

// Number of assistant turns shown to the user — used for the visual "step N of M" indicator.
export function assistantTurnCount(messages: OnboardingMessage[]): number {
  return messages.filter((m) => m.role === "assistant").length;
}

// Total cap we render in the UI (matches the API's MAX_ONBOARDING_TURNS).
export const STEP_TOTAL = MAX_ONBOARDING_TURNS;

// Parses an /api/onboarding/turn response body. Returns null when it can't be coerced into the
// expected shape (network fluke / proxy error). The caller routes nulls into a friendly banner.
export function parseTurnResponse(raw: unknown): OnboardingTurnResponse | null {
  const r = OnboardingTurnResponseSchema.safeParse(raw);
  return r.success ? r.data : null;
}

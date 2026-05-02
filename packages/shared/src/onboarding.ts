import { z } from "zod";

// Conversational onboarding (STORY-053). Wire shape between the browser, the Next.js proxy, and
// the Fastify `POST /v1/onboarding/turn` endpoint. The agent drives the conversation; the API
// extracts structured profile-field updates per turn and persists them incrementally.
//
// Field shapes mirror `profiles` in @learnpro/db:
//   - target_role:           text         → string | null
//   - time_budget_min:       integer      → number | null
//   - primary_goal:          text         → string | null
//   - self_assessed_level:   text         → string | null
//   - language_comfort:      jsonb        → Record<string, "comfortable" | "rusty" | "new"> | null

const LanguageComfortLevelSchema = z.enum(["comfortable", "rusty", "new"]);
export type LanguageComfortLevel = z.infer<typeof LanguageComfortLevelSchema>;

export const ProfileFieldUpdatesSchema = z
  .object({
    target_role: z.string().min(1).max(120).nullable(),
    time_budget_min: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .nullable(),
    primary_goal: z.string().min(1).max(280).nullable(),
    self_assessed_level: z.string().min(1).max(60).nullable(),
    language_comfort: z.record(z.string().min(1), LanguageComfortLevelSchema).nullable(),
  })
  .partial();
export type ProfileFieldUpdates = z.infer<typeof ProfileFieldUpdatesSchema>;

export const OnboardingMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("assistant"), content: z.string().min(1) }),
  z.object({ role: z.literal("user"), content: z.string().min(1) }),
]);
export type OnboardingMessage = z.infer<typeof OnboardingMessageSchema>;

// Hard caps on the conversation. The API enforces these so an over-eager client can't run up an
// unbounded LLM bill — when either cap trips, the server returns `done: true` with whatever was
// captured so far and a friendly closing message.
//
// 6 turns ≈ 3 assistant questions + 3 user answers, plus 1 seeded greeting. Empirically more than
// enough to harvest target_role / time_budget_min / primary_goal from a typical first-login chat.
export const MAX_ONBOARDING_TURNS = 6;
// Per-conversation token budget across all turns. Haiku at 400 max_tokens × 6 turns is a hard
// ceiling around 2400 tokens of *output*; this 3000 cap also covers system prompt + accumulating
// history tokens.
export const MAX_ONBOARDING_TOKENS = 3000;

export const OnboardingTurnRequestSchema = z.object({
  messages: z.array(OnboardingMessageSchema).min(1),
});
export type OnboardingTurnRequest = z.infer<typeof OnboardingTurnRequestSchema>;

export const OnboardingTurnResponseSchema = z.object({
  assistant_message: z.string().min(1),
  captured: ProfileFieldUpdatesSchema,
  done: z.boolean(),
});
export type OnboardingTurnResponse = z.infer<typeof OnboardingTurnResponseSchema>;

import { z } from "zod";

// Mirrors `interaction_type` pgEnum in @learnpro/db. Keep in sync.
export const InteractionTypeSchema = z.enum([
  "cursor_focus",
  "voice",
  "edit",
  "revert",
  "run",
  "submit",
  "hint_request",
  "hint_received",
  "autonomy_decision",
]);
export type InteractionType = z.infer<typeof InteractionTypeSchema>;

const Range = z.object({
  start_line: z.number().int().nonnegative(),
  start_col: z.number().int().nonnegative(),
  end_line: z.number().int().nonnegative(),
  end_col: z.number().int().nonnegative(),
});
export type InteractionRange = z.infer<typeof Range>;

export const CursorFocusPayloadSchema = z.object({
  file: z.string().min(1).optional(),
  function: z.string().min(1).optional(),
  line_start: z.number().int().nonnegative(),
  line_end: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
});

export const VoicePayloadSchema = z.object({
  transcript: z.string().min(1),
  language: z.string().min(2).max(16).optional(),
});

export const EditPayloadSchema = z.object({
  from: z.string(),
  to: z.string(),
  range: Range,
});

export const RevertPayloadSchema = z.object({
  original: z.string(),
  current_after_revert: z.string(),
  range: Range,
});

export const RunPayloadSchema = z.object({
  language: z.string().min(1),
  exit_code: z.number().int(),
  duration_ms: z.number().int().nonnegative().optional(),
});

export const SubmitPayloadSchema = z.object({
  passed: z.boolean(),
});

const HintRungSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const HintRequestPayloadSchema = z.object({ rung: HintRungSchema });
export const HintReceivedPayloadSchema = z.object({ rung: HintRungSchema });

export const AutonomyDecisionPayloadSchema = z.object({
  decision: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const baseEvent = z.object({
  client_event_id: z.string().min(1).optional(),
  episode_id: z.string().uuid().optional(),
  t: z.string().datetime({ offset: true }).optional(),
});

export const InteractionEventSchema = z.discriminatedUnion("type", [
  baseEvent.extend({ type: z.literal("cursor_focus"), payload: CursorFocusPayloadSchema }),
  baseEvent.extend({ type: z.literal("voice"), payload: VoicePayloadSchema }),
  baseEvent.extend({ type: z.literal("edit"), payload: EditPayloadSchema }),
  baseEvent.extend({ type: z.literal("revert"), payload: RevertPayloadSchema }),
  baseEvent.extend({ type: z.literal("run"), payload: RunPayloadSchema }),
  baseEvent.extend({ type: z.literal("submit"), payload: SubmitPayloadSchema }),
  baseEvent.extend({ type: z.literal("hint_request"), payload: HintRequestPayloadSchema }),
  baseEvent.extend({ type: z.literal("hint_received"), payload: HintReceivedPayloadSchema }),
  baseEvent.extend({
    type: z.literal("autonomy_decision"),
    payload: AutonomyDecisionPayloadSchema,
  }),
]);
export type InteractionEvent = z.infer<typeof InteractionEventSchema>;

// Server-side row shape — what the ingestion endpoint stores. The transport schema above
// allows `t` and `episode_id` to be optional (server stamps `t` on receive, anonymous
// playground events have no episode); the stored shape pins both to concrete values
// (Date for t, `string | null` for nullable FKs).
export type StoredInteraction = Omit<InteractionEvent, "t" | "client_event_id" | "episode_id"> & {
  t: Date;
  user_id: string | null;
  episode_id: string | null;
};

// Cap a single batch so an over-eager client can't ship a 100k-row payload to the API.
// 200 events @ ~1KB each = ~200KB, well under the default Fastify body limit.
export const MAX_INTERACTIONS_PER_BATCH = 200;

export const InteractionsBatchSchema = z.object({
  events: z.array(InteractionEventSchema).min(1).max(MAX_INTERACTIONS_PER_BATCH),
});
export type InteractionsBatch = z.infer<typeof InteractionsBatchSchema>;

export const InteractionsBatchResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
});
export type InteractionsBatchResponse = z.infer<typeof InteractionsBatchResponseSchema>;

export interface InteractionStore {
  /**
   * Persist a batch of interaction events. Implementations should INSERT all rows in a single
   * round-trip when possible. Throws on hard DB failure; the API surfaces that as 500.
   */
  recordBatch(events: StoredInteraction[]): Promise<void>;
}

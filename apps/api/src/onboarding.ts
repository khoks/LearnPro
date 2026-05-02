import { ANTHROPIC_HAIKU, TokenBudgetExceededError, type LLMProvider } from "@learnpro/llm";
import { ONBOARDING_PROMPT_VERSION, ONBOARDING_SYSTEM_PROMPT } from "@learnpro/prompts";
import {
  MAX_ONBOARDING_TOKENS,
  MAX_ONBOARDING_TURNS,
  OnboardingTurnRequestSchema,
  OnboardingTurnResponseSchema,
  ProfileFieldUpdatesSchema,
  type OnboardingMessage,
  type OnboardingTurnResponse,
  type ProfileFieldUpdates,
} from "@learnpro/shared";
import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";

// Optional persistence callback — apps/web wires this to `updateProfileFields()` once auth is
// resolved. Keeping it injectable lets tests assert the right calls without booting Postgres.
export type OnboardingProfileWriter = (
  user_id: string,
  updates: ProfileFieldUpdates,
) => Promise<void>;

export interface OnboardingHandlerOptions {
  llm: LLMProvider;
  sessionResolver: SessionResolver;
  profileWriter?: OnboardingProfileWriter;
}

const FRIENDLY_CAP_REACHED_MESSAGE =
  "Got enough to get you started — heading to your dashboard. We can fine-tune as you practice.";

const FRIENDLY_PARSE_FALLBACK_MESSAGE =
  "Can you tell me a bit more about that? A sentence or two is plenty.";

const FRIENDLY_CLOSEOUT_MESSAGE = "Sounds good — let's get you started. Heading to your dashboard.";

// User says any of these → graceful exit. Match against the latest user message, lowercased.
const SKIP_PHRASES = [
  "skip",
  "later",
  "i'd rather",
  "id rather",
  "start now",
  "just start",
  "let's start",
  "lets start",
  "let's go",
  "lets go",
  "i'll do this later",
  "ill do this later",
];

function userTriggeredExit(message: string): boolean {
  const lower = message.toLowerCase();
  return SKIP_PHRASES.some((p) => lower.includes(p));
}

// LEARNPRO_DISABLE_ONBOARDING_LLM=1 → 3-question deterministic flow that captures target_role,
// time_budget_min, primary_goal in sequence. Satisfies AC #6 (graceful fallback when no LLM).
const FALLBACK_QUESTION_TARGET_ROLE =
  "What kind of role are you preparing for? (e.g. backend SWE intern, ML engineer, career switcher)";
const FALLBACK_QUESTION_TIME_BUDGET =
  "How many minutes per day can you realistically practice? (5-1440)";
const FALLBACK_QUESTION_PRIMARY_GOAL =
  "In one sentence — what do you most want to get out of LearnPro?";
const FALLBACK_CLOSEOUT = "Got it — heading to your dashboard now.";

interface FallbackTurn {
  assistant_message: string;
  done: boolean;
  capture: keyof ProfileFieldUpdates | null;
}

// Stateless fallback: looks at how many user messages have arrived so far and picks the next
// question. Captures the prior user answer into the relevant field.
export function deterministicFallbackTurn(messages: OnboardingMessage[]): OnboardingTurnResponse {
  const userMessages = messages.filter((m) => m.role === "user");
  const lastUser = userMessages[userMessages.length - 1];
  const userTurn = userMessages.length;

  if (lastUser && userTriggeredExit(lastUser.content)) {
    return { assistant_message: FRIENDLY_CLOSEOUT_MESSAGE, captured: {}, done: true };
  }

  // Question sequence — turn 1 captures target_role from user's reply, turn 2 captures
  // time_budget_min, turn 3 captures primary_goal and wraps up.
  const sequence: FallbackTurn[] = [
    { assistant_message: FALLBACK_QUESTION_TARGET_ROLE, done: false, capture: null },
    { assistant_message: FALLBACK_QUESTION_TIME_BUDGET, done: false, capture: "target_role" },
    {
      assistant_message: FALLBACK_QUESTION_PRIMARY_GOAL,
      done: false,
      capture: "time_budget_min",
    },
    { assistant_message: FALLBACK_CLOSEOUT, done: true, capture: "primary_goal" },
  ];
  const turn = sequence[Math.min(userTurn, sequence.length - 1)] ?? sequence[sequence.length - 1]!;

  const captured: ProfileFieldUpdates = {};
  if (turn.capture && lastUser) {
    captureFromText(turn.capture, lastUser.content, captured);
  }

  return {
    assistant_message: turn.assistant_message,
    captured,
    done: turn.done,
  };
}

function captureFromText(
  field: keyof ProfileFieldUpdates,
  text: string,
  into: ProfileFieldUpdates,
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (field === "time_budget_min") {
    const match = trimmed.match(/\d+/);
    if (!match) return;
    const n = Number(match[0]);
    if (Number.isFinite(n) && n >= 1 && n <= 24 * 60) into.time_budget_min = n;
    return;
  }
  if (field === "target_role" || field === "primary_goal" || field === "self_assessed_level") {
    into[field] = trimmed.slice(0, field === "primary_goal" ? 280 : 120);
  }
}

// Counts very rough token usage across a conversation: ~4 chars per token, both roles. Keeps
// the cap check cheap; the LLM provider's real usage is the source of truth post-call, but the
// server caps proactively before the LLM round-trip.
export function approximateTokenCount(messages: OnboardingMessage[]): number {
  let chars = 0;
  for (const m of messages) chars += m.content.length;
  return Math.ceil(chars / 4);
}

// Strips a markdown ```json ... ``` fence if present, then JSON-parses. Returns null on failure.
function safeParseJson(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

function shouldUseFallback(): boolean {
  return process.env["LEARNPRO_DISABLE_ONBOARDING_LLM"] === "1";
}

export function registerOnboardingRoute(
  app: FastifyInstance,
  opts: OnboardingHandlerOptions,
): void {
  app.post("/v1/onboarding/turn", async (req, reply) => {
    const parsed = OnboardingTurnRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const session = await opts.sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const { messages } = parsed.data;
    const assistantTurns = messages.filter((m) => m.role === "assistant").length;
    const totalTokens = approximateTokenCount(messages);

    // Hard caps — gracefully wrap up. The /onboarding UI takes `done: true` as the signal to
    // route the user to /dashboard, so this is also the runaway-cost guard.
    if (assistantTurns >= MAX_ONBOARDING_TURNS || totalTokens >= MAX_ONBOARDING_TOKENS) {
      const out: OnboardingTurnResponse = {
        assistant_message: FRIENDLY_CAP_REACHED_MESSAGE,
        captured: {},
        done: true,
      };
      return reply.code(200).send(out);
    }

    // Fallback path: LLM disabled. Returns a deterministic 3-question form-equivalent.
    if (shouldUseFallback()) {
      const fb = deterministicFallbackTurn(messages);
      if (Object.keys(fb.captured).length > 0 && opts.profileWriter) {
        try {
          await opts.profileWriter(session.user_id, fb.captured);
        } catch (err) {
          req.log.warn({ err }, "profile writer threw — continuing without persist");
        }
      }
      return reply.code(200).send(fb);
    }

    // Live LLM path.
    let llmText: string;
    try {
      const res = await opts.llm.complete({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        system: ONBOARDING_SYSTEM_PROMPT,
        model: ANTHROPIC_HAIKU,
        max_tokens: 400,
        temperature: 0.6,
        role: "tutor",
        prompt_version: ONBOARDING_PROMPT_VERSION,
        user_id: session.user_id,
      });
      llmText = res.text;
    } catch (err) {
      // Token-budget — let the global error handler convert to 429.
      if (err instanceof TokenBudgetExceededError) throw err;
      req.log.warn({ err }, "onboarding LLM call failed — surfacing 503");
      return reply.code(503).send({
        error: "onboarding_unavailable",
        message:
          "The onboarding coach is briefly unavailable. Try again, or skip to the dashboard.",
      });
    }

    const raw = safeParseJson(llmText);
    if (!raw || typeof raw !== "object") {
      req.log.warn({ llmText }, "onboarding LLM returned unparseable response");
      return reply.code(200).send({
        assistant_message: FRIENDLY_PARSE_FALLBACK_MESSAGE,
        captured: {},
        done: false,
      });
    }

    const validated = OnboardingTurnResponseSchema.safeParse(raw);
    if (!validated.success) {
      // Try a partial shape: at minimum we need an assistant_message string. captured/done get
      // benign defaults.
      const obj = raw as Record<string, unknown>;
      const msg = typeof obj["assistant_message"] === "string" ? obj["assistant_message"] : null;
      if (!msg) {
        req.log.warn({ raw }, "onboarding LLM JSON missing assistant_message");
        return reply.code(200).send({
          assistant_message: FRIENDLY_PARSE_FALLBACK_MESSAGE,
          captured: {},
          done: false,
        });
      }
      const capturedRaw = obj["captured"];
      const captured = ProfileFieldUpdatesSchema.safeParse(capturedRaw ?? {});
      const out: OnboardingTurnResponse = {
        assistant_message: msg,
        captured: captured.success ? captured.data : {},
        done: typeof obj["done"] === "boolean" ? obj["done"] : false,
      };
      if (Object.keys(out.captured).length > 0 && opts.profileWriter) {
        try {
          await opts.profileWriter(session.user_id, out.captured);
        } catch (writeErr) {
          req.log.warn({ err: writeErr }, "profile writer threw — continuing without persist");
        }
      }
      return reply.code(200).send(out);
    }

    const data = validated.data;
    if (Object.keys(data.captured).length > 0 && opts.profileWriter) {
      try {
        await opts.profileWriter(session.user_id, data.captured);
      } catch (err) {
        req.log.warn({ err }, "profile writer threw — continuing without persist");
      }
    }
    return reply.code(200).send(data);
  });
}

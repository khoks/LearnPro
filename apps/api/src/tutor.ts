import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  ComprehensionAnswerSchema,
  ComprehensionDepsNotWiredError,
  GradeInputShapeMismatchError,
  IllegalTransitionError,
  TutorSession,
  type AssignProblemTool,
  type ComprehensionAnswer,
  type FinalOutcome,
  type GiveHintTool,
  type GradeTool,
  type HintRung,
  type TutorSessionTools,
  type UpdateProfileTool,
} from "@learnpro/agent";
import {
  EpisodeNotFoundError,
  NoEligibleProblemError,
  UpdateProfileEpisodeMissingError,
} from "@learnpro/agent";
import type { SessionResolver } from "./session.js";
import type { PiiRedactor } from "./redactor.js";

// Factory pattern: the production wiring constructs a TutorSession by reading the existing
// `episodes` row, building the four tools from real LLM/DB/sandbox deps, and handing back a
// session object. Tests inject a fake factory so they don't need to boot any of those.
export interface TutorAgentFactory {
  // Called by `POST /v1/tutor/episodes` — there is no episode_id yet, so the tools resolve the
  // user's track + recent episodes, then assign a new problem.
  createForAssign(input: { user_id: string; org_id: string; track_id: string }): Promise<{
    session: TutorSession;
    tools: TutorSessionTools;
  }>;

  // Called by `POST /v1/tutor/episodes/:id/{hint,submit,finish}`. The factory rehydrates the
  // session state from the episode row (last submit count, hints used, problem_id, started_at)
  // and returns a session ready to advance.
  createForExisting(input: {
    user_id: string;
    org_id: string;
    track_id: string;
    episode_id: string;
  }): Promise<{
    session: TutorSession;
    tools: TutorSessionTools;
  } | null>;
}

const StartEpisodeBodySchema = z.object({
  track_id: z.string().uuid(),
});

const HintBodySchema = z.object({
  rung: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

// STORY-038a — submit body union. Implement/debug episodes pass `code`; comprehension
// episodes pass `comprehension_answer`. The grade tool dispatches on `episode.problem.kind`
// to decide which is required.
const SubmitBodySchema = z.union([
  z.object({ code: z.string().min(1) }),
  z.object({ comprehension_answer: ComprehensionAnswerSchema }),
]);

const GotHelpBodySchema = z.object({
  got_help: z.boolean(),
});

const FinishBodySchema = z.object({
  outcome: z.enum(["passed", "passed_with_hints", "failed", "abandoned", "revealed"]).optional(),
  reveal_clicked: z.boolean().optional(),
});

// STORY-042 — narrow side-effect port for the got-help endpoint. Production wires this to
// @learnpro/db's `markEpisodeGotHelp`; tests inject a fake. The user-id check inside the helper is
// defense-in-depth — the per-tenant mark won't accidentally cross-contaminate.
export interface GotHelpStore {
  markEpisodeGotHelp(input: {
    user_id: string;
    episode_id: string;
    got_help: boolean;
  }): Promise<{ updated: boolean }>;
}

export interface RegisterTutorRoutesOptions {
  factory: TutorAgentFactory;
  sessionResolver: SessionResolver;
  // STORY-056 — code submissions are run through `redactor.redact(code, { allowUrls: true })`
  // before being handed to the grade tool. URLs are preserved (tutorials often link docs); emails
  // / phones / IDs / cards are still scrubbed.
  redactor: PiiRedactor;
  // STORY-042 — optional. When wired, the `POST /v1/tutor/episodes/:id/got-help` endpoint flips
  // `episodes.got_help` for honest-self-mark submissions. Tests can omit this — the route returns
  // 503 until the dependency is wired (so the surface fails closed, never silently).
  gotHelpStore?: GotHelpStore;
  // STORY-033 — optional session-end hook. Fired after a successful `finish()` close. The
  // production wiring forwards (user_id, episode_id) to the profile-insights BullMQ queue so
  // the async synthesis agent runs out-of-band; tests inject a fake to assert the call shape.
  // Errors thrown by the hook are swallowed (logged via req.log) so a misbehaving side-channel
  // never blocks the user-facing close response.
  onEpisodeFinish?(input: { user_id: string; org_id: string; episode_id: string }): Promise<void>;
  // STORY-041a — optional cheatsheet-enqueue hook. Independent from `onEpisodeFinish` so a
  // misbehaving cheatsheet queue can't block the profile-insights enqueue (and vice-versa).
  // Both hooks fire after a successful `finish()` close; their errors are swallowed the same
  // way. Production wires the BullMQ enqueue helper (`enqueueCheatsheetJob`) for an episode
  // set of `[episode_id]`; tests inject a fake to assert the call shape.
  onCheatsheetEnqueue?(input: {
    user_id: string;
    org_id: string;
    episode_id: string;
  }): Promise<void>;
}

export function registerTutorRoutes(app: FastifyInstance, opts: RegisterTutorRoutesOptions): void {
  // POST /v1/tutor/episodes — start a new episode (assign a problem).
  app.post("/v1/tutor/episodes", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    const parsed = StartEpisodeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    let factoryResult;
    try {
      factoryResult = await opts.factory.createForAssign({
        user_id: session.user_id,
        org_id: session.org_id,
        track_id: parsed.data.track_id,
      });
    } catch (err) {
      return mapToolError(reply, err);
    }

    try {
      const out = await factoryResult.session.assign();
      return reply.code(201).send(out);
    } catch (err) {
      return mapToolError(reply, err);
    }
  });

  // POST /v1/tutor/episodes/:id/hint — give a hint at the requested rung.
  app.post<{ Params: { id: string }; Body: { rung: HintRung } }>(
    "/v1/tutor/episodes/:id/hint",
    async (req, reply) => {
      const session = await opts.sessionResolver(req);
      if (!session) return reply.code(401).send({ error: "unauthorized" });

      const parsed = HintBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
      }

      const factoryResult = await loadExisting(opts, session, req.params.id);
      if (!factoryResult) return reply.code(404).send({ error: "episode_not_found" });

      try {
        const out = await factoryResult.session.requestHint(parsed.data.rung);
        return reply.code(200).send(out);
      } catch (err) {
        return mapToolError(reply, err);
      }
    },
  );

  // POST /v1/tutor/episodes/:id/submit — grade a submission.
  // STORY-038a — dispatch on body shape: implement/debug pass `code` (PII-redacted before the
  // grade tool sees it); comprehension passes `comprehension_answer` (multiple-choice index OR
  // free-text string). The grade tool's runtime check matches the body shape against
  // `episode.problem.kind`; any mismatch raises GradeInputShapeMismatchError → 400.
  app.post<{
    Params: { id: string };
    Body: { code: string } | { comprehension_answer: ComprehensionAnswer };
  }>("/v1/tutor/episodes/:id/submit", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    const parsed = SubmitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const factoryResult = await loadExisting(opts, session, req.params.id);
    if (!factoryResult) return reply.code(404).send({ error: "episode_not_found" });

    try {
      if ("comprehension_answer" in parsed.data) {
        // Comprehension answers don't need PII redaction — multiple-choice carries no user
        // text, and free-text answers are short prose typed into a textarea (any URL/email
        // would be off-topic). Skip redaction entirely.
        const out = await factoryResult.session.submitComprehension(
          parsed.data.comprehension_answer,
        );
        return reply.code(200).send(out);
      }
      const redaction = await opts.redactor.redact(parsed.data.code, { allowUrls: true });
      const out = await factoryResult.session.submit(redaction.redacted);
      return reply.code(200).send(out);
    } catch (err) {
      return mapToolError(reply, err);
    }
  });

  // STORY-042 — POST /v1/tutor/episodes/:id/got-help — flip episodes.got_help for honest-self-mark
  // submissions. The submission itself was already graded normally (tests still run, XP still
  // awards); this endpoint is a secondary side-effect that only the close-time skill update
  // consumes. Idempotent: repeating the call with the same value is a cheap no-op.
  app.post<{ Params: { id: string }; Body: { got_help: boolean } }>(
    "/v1/tutor/episodes/:id/got-help",
    async (req, reply) => {
      const session = await opts.sessionResolver(req);
      if (!session) return reply.code(401).send({ error: "unauthorized" });

      const parsed = GotHelpBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
      }

      if (!opts.gotHelpStore) {
        return reply.code(503).send({
          error: "got_help_store_not_wired",
          message: "got_help store is not configured on this server",
        });
      }

      const r = await opts.gotHelpStore.markEpisodeGotHelp({
        user_id: session.user_id,
        episode_id: req.params.id,
        got_help: parsed.data.got_help,
      });
      if (!r.updated) {
        return reply.code(404).send({ error: "episode_not_found" });
      }
      return reply.code(200).send({ ok: true, got_help: parsed.data.got_help });
    },
  );

  // POST /v1/tutor/episodes/:id/finish — close the episode + update profile.
  app.post<{
    Params: { id: string };
    Body: { outcome?: FinalOutcome; reveal_clicked?: boolean };
  }>("/v1/tutor/episodes/:id/finish", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    const parsed = FinishBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const factoryResult = await loadExisting(opts, session, req.params.id);
    if (!factoryResult) return reply.code(404).send({ error: "episode_not_found" });

    try {
      const finishArgs: { outcome?: FinalOutcome; reveal_clicked?: boolean } = {};
      if (parsed.data.outcome !== undefined) finishArgs.outcome = parsed.data.outcome;
      if (parsed.data.reveal_clicked !== undefined) {
        finishArgs.reveal_clicked = parsed.data.reveal_clicked;
      }
      const out = await factoryResult.session.finish(finishArgs);
      // STORY-033 / STORY-041a — fire the session-end side-channel hooks (best-effort).
      // Production wires the profile-insights enqueue here AND the cheatsheet enqueue. The two
      // are independently injectable so a misbehaving cheatsheet queue can't block the
      // profile-insights enqueue (and vice-versa). Hook errors are swallowed so a misbehaving
      // queue can never block the user's close response.
      if (opts.onEpisodeFinish) {
        try {
          await opts.onEpisodeFinish({
            user_id: session.user_id,
            org_id: session.org_id,
            episode_id: req.params.id,
          });
        } catch (err) {
          req.log.warn({ err }, "onEpisodeFinish hook failed (non-fatal)");
        }
      }
      if (opts.onCheatsheetEnqueue) {
        try {
          await opts.onCheatsheetEnqueue({
            user_id: session.user_id,
            org_id: session.org_id,
            episode_id: req.params.id,
          });
        } catch (err) {
          req.log.warn({ err }, "onCheatsheetEnqueue hook failed (non-fatal)");
        }
      }
      return reply.code(200).send(out);
    } catch (err) {
      return mapToolError(reply, err);
    }
  });
}

async function loadExisting(
  opts: RegisterTutorRoutesOptions,
  session: { user_id: string; org_id: string },
  episode_id: string,
): Promise<{ session: TutorSession; tools: TutorSessionTools } | null> {
  // The factory needs a track_id but for an existing episode we don't have one in the URL.
  // The factory implementation reads the episode row to recover it. We pass a sentinel that
  // factories MUST resolve internally. Default Drizzle factory does this; tests pass a fake
  // factory that ignores the field.
  return opts.factory.createForExisting({
    user_id: session.user_id,
    org_id: session.org_id,
    track_id: "00000000-0000-4000-8000-000000000000",
    episode_id,
  });
}

// Centralized tool-error → HTTP-status mapping. Domain errors:
//   NoEligibleProblemError       → 404 (no problem in the catalog at the chosen tier)
//   EpisodeNotFoundError         → 404 (the give-hint / grade tool couldn't find the episode)
//   UpdateProfileEpisodeMissing  → 404 (same, for updateProfile)
//   IllegalTransitionError       → 409 (state machine refused the move)
//   anything else                → re-throw (Fastify error handler maps TokenBudgetExceededError
//                                  → 429 + everything else → 500)
function mapToolError(reply: FastifyReply, err: unknown): unknown {
  // STORY-038a — comprehension dispatch errors.
  if (err instanceof ComprehensionDepsNotWiredError) {
    return reply.code(503).send({
      error: "comprehension_deps_not_wired",
      message: err.message,
    });
  }
  if (err instanceof GradeInputShapeMismatchError) {
    return reply.code(400).send({
      error: "invalid_request",
      message: err.message,
    });
  }
  if (err instanceof IllegalTransitionError) {
    return reply.code(409).send({
      error: "illegal_transition",
      message: err.message,
      from_phase: err.from,
      action: err.action,
    });
  }
  if (err instanceof EpisodeNotFoundError) {
    return reply.code(404).send({ error: "episode_not_found", message: err.message });
  }
  if (err instanceof UpdateProfileEpisodeMissingError) {
    return reply.code(404).send({ error: "episode_not_found", message: err.message });
  }
  if (err instanceof NoEligibleProblemError) {
    return reply.code(404).send({
      error: "no_eligible_problem",
      message: err.message,
      tier: err.tier,
      track_id: err.track_id,
    });
  }
  throw err;
}

// ---- Re-exports for the apps/api wiring layer (drizzle / LLM-backed tool factories). ----

export type { AssignProblemTool, GiveHintTool, GradeTool, UpdateProfileTool, TutorSessionTools };

import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  IllegalTransitionError,
  TutorSession,
  type AssignProblemTool,
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

const SubmitBodySchema = z.object({
  code: z.string().min(1),
});

const FinishBodySchema = z.object({
  outcome: z.enum(["passed", "passed_with_hints", "failed", "abandoned", "revealed"]).optional(),
  reveal_clicked: z.boolean().optional(),
});

export interface RegisterTutorRoutesOptions {
  factory: TutorAgentFactory;
  sessionResolver: SessionResolver;
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
  app.post<{ Params: { id: string }; Body: { code: string } }>(
    "/v1/tutor/episodes/:id/submit",
    async (req, reply) => {
      const session = await opts.sessionResolver(req);
      if (!session) return reply.code(401).send({ error: "unauthorized" });

      const parsed = SubmitBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
      }

      const factoryResult = await loadExisting(opts, session, req.params.id);
      if (!factoryResult) return reply.code(404).send({ error: "episode_not_found" });

      try {
        const out = await factoryResult.session.submit(parsed.data.code);
        return reply.code(200).send(out);
      } catch (err) {
        return mapToolError(reply, err);
      }
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

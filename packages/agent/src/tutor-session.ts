import {
  IllegalTransitionError,
  type FinalOutcome,
  type HintRecord,
  type HintRung,
  type TutorState,
} from "./state.js";
import type { GraderAgentRubric } from "./ports.js";
import type { AssignProblemTool, AssignProblemOutput } from "./tools/assign-problem.js";
import type { GiveHintOutput, GiveHintTool } from "./tools/give-hint.js";
import type { GradeOutput, GradeTool } from "./tools/grade.js";
import type { PlanSessionInput, PlanSessionOutput, PlanSessionTool } from "./tools/plan-session.js";
import type { UpdateProfileOutput, UpdateProfileTool } from "./tools/update-profile.js";
import { deriveFinalOutcome } from "./tools/update-profile.js";
import type {
  ActionConsequence,
  AutonomyBandedDecision,
  AsyncAutonomyPolicy,
} from "@learnpro/scoring";

export interface TutorSessionTools {
  assignProblem: AssignProblemTool;
  giveHint: GiveHintTool;
  grade: GradeTool;
  updateProfile: UpdateProfileTool;
  // Optional — present only when the planner is wired into the harness. The /session UI calls
  // `planForToday()` as a side action; the state machine's main loop never depends on it.
  planSession?: PlanSessionTool;
}

// STORY-054 — kinds of "should I just do this?" branch points the autonomy controller is asked
// about. Each maps to a well-known `consequence` tier:
//   `assign-next-problem`    → trivial (next-pick is the steady-state cadence)
//   `proactive-hint`         → consequential (offering an unsolicited hint changes flow)
//   `auto-set-final-outcome` → consequential (the user might want to override)
//   `switch-track`           → disruptive (track switch is a major context change)
export type AutonomyActionKind =
  | "assign-next-problem"
  | "proactive-hint"
  | "auto-set-final-outcome"
  | "switch-track";

export const AUTONOMY_ACTION_CONSEQUENCE: Record<AutonomyActionKind, ActionConsequence> = {
  "assign-next-problem": "trivial",
  "proactive-hint": "consequential",
  "auto-set-final-outcome": "consequential",
  "switch-track": "disruptive",
};

export interface AutonomyAdvice {
  kind: AutonomyActionKind;
  decision: AutonomyBandedDecision;
}

export interface TutorSessionOptions {
  user_id: string;
  org_id: string;
  track_id: string;
  tools: TutorSessionTools;
  // Allows tests to control time deterministically.
  now?: () => number;
  // Pre-existing state — used by API layer to rehydrate a session from the DB row instead of
  // starting from idle. Default is `idle`.
  initial_state?: TutorState;
  // STORY-054 — optional adaptive autonomy policy. When wired, the harness asks the policy at
  // each "should I just do this?" branch point (e.g. assign-next-problem, proactive-hint). Tests
  // and the MVP default leave this undefined; production wires `EwmaBandedAutonomyPolicy`.
  autonomyPolicy?: AsyncAutonomyPolicy;
  // Episode count for the user — fed straight into the autonomy policy's cold-start guard. The
  // factory layer reads this from `countClosedEpisodes` before constructing the session.
  episode_count?: number;
}

// State-machine driver for one tutor episode (or sequence of episodes within a single session).
// All four tools (assignProblem / giveHint / grade / updateProfile) are owned here; the public
// methods are the only legal entry points + each transitions the state, throwing
// IllegalTransitionError on unsupported moves.
//
// The driver is INTENTIONALLY synchronous-feeling (each method awaits the underlying tool then
// updates `state`). It is NOT thread-safe across concurrent calls — the API layer serializes
// per-episode requests by virtue of the HTTP client/server model.
export class TutorSession {
  readonly user_id: string;
  readonly org_id: string;
  readonly track_id: string;
  private readonly tools: TutorSessionTools;
  private readonly now: () => number;
  private readonly autonomyPolicy: AsyncAutonomyPolicy | undefined;
  private readonly episodeCount: number;
  private _state: TutorState;
  // STORY-034 — the most-recent grader rubric from this session's submit() call. Passed to
  // updateProfile on finish() so the profile-skill bonus uses it. Cleared on assign() (next
  // episode starts fresh). Not part of the persisted state schema — purely in-memory.
  private _lastGraderRubric: GraderAgentRubric | null = null;

  constructor(opts: TutorSessionOptions) {
    this.user_id = opts.user_id;
    this.org_id = opts.org_id;
    this.track_id = opts.track_id;
    this.tools = opts.tools;
    this.now = opts.now ?? (() => Date.now());
    this.autonomyPolicy = opts.autonomyPolicy;
    this.episodeCount = opts.episode_count ?? 0;
    this._state =
      opts.initial_state ??
      ({
        phase: "idle",
        user_id: opts.user_id,
        org_id: opts.org_id,
        track_id: opts.track_id,
        hints: [],
        attempts: 0,
      } as TutorState);
  }

  get state(): TutorState {
    return this._state;
  }

  // STORY-034 — exposed for the API + tests. The session's most-recent grader output (or null
  // when the grader wasn't wired or hasn't run yet on this episode).
  get lastGraderRubric(): GraderAgentRubric | null {
    return this._lastGraderRubric;
  }

  // STORY-054 — ask the autonomy controller about a single "should I just do this?" branch
  // point. Returns null when no policy is wired (the AlwaysConfirm baseline behaviour: callers
  // must always confirm explicitly through the UI). Otherwise returns the policy's decision so
  // the caller can decide whether to execute or surface a confirmation prompt.
  async consultAutonomy(kind: AutonomyActionKind): Promise<AutonomyAdvice | null> {
    const policy = this.autonomyPolicy;
    if (!policy) return null;
    const consequence = AUTONOMY_ACTION_CONSEQUENCE[kind];
    const decision = await policy.decide({
      action: { kind, consequence },
      user_id: this.user_id,
      episode_count: this.episodeCount,
    });
    return { kind, decision };
  }

  async assign(): Promise<AssignProblemOutput> {
    if (this._state.phase !== "idle" && this._state.phase !== "done") {
      throw new IllegalTransitionError(this._state.phase, "assign");
    }
    // STORY-034 — start a fresh episode → discard the previous episode's grader rubric.
    this._lastGraderRubric = null;
    const out = await this.tools.assignProblem.run({
      user_id: this.user_id,
      org_id: this.org_id,
      track_id: this.track_id,
    });
    this._state = {
      phase: "assigned",
      user_id: this.user_id,
      org_id: this.org_id,
      track_id: this.track_id,
      episode_id: out.episode_id,
      problem_id: out.problem_id,
      problem_slug: out.problem_slug,
      started_at: out.started_at,
      hints: [],
      attempts: 0,
    };
    // Once the user starts coding, we're in `coding` — no extra event needed; assign() is
    // immediately followed by the user typing into the editor.
    this._state = { ...this._state, phase: "coding" };
    return out;
  }

  async requestHint(rung: HintRung): Promise<GiveHintOutput> {
    if (this._state.phase !== "coding") {
      throw new IllegalTransitionError(this._state.phase, "requestHint");
    }
    const episode_id = this._state.episode_id;
    const out = await this.tools.giveHint.run({ episode_id, rung });
    const hint: HintRecord = { rung, hint: out.hint, xp_cost: out.xp_cost };
    this._state = { ...this._state, hints: [...this._state.hints, hint] };
    return out;
  }

  async submit(code: string): Promise<GradeOutput> {
    if (this._state.phase !== "coding" && this._state.phase !== "grading") {
      throw new IllegalTransitionError(this._state.phase, "submit");
    }
    const episode_id = this._state.episode_id;
    const out = await this.tools.grade.run({ episode_id, code });
    // STORY-034 — capture the latest grader rubric (or null on the legacy unified-tutor codepath)
    // so `finish()` can hand it to the profile-skill update for the rubric-aware bonus.
    this._lastGraderRubric = out.grader ?? null;
    // Each submit increments attempts. The state machine stays in `grading` until either the user
    // submits again (back to `grading`) or finishes the episode.
    const nextAttempts = this._state.attempts + 1;
    this._state = {
      phase: "grading",
      user_id: this.user_id,
      org_id: this.org_id,
      track_id: this.track_id,
      episode_id,
      problem_id: this._state.problem_id,
      problem_slug: this._state.problem_slug,
      started_at: this._state.started_at,
      hints: this._state.hints,
      attempts: nextAttempts,
      last_passed: out.passed,
    };
    if (!out.passed) {
      // Failed submit → back to coding so the user can iterate.
      this._state = { ...this._state, phase: "coding" };
    }
    return out;
  }

  // The user (or the UI on their behalf) declares this episode finished. `outcome === "abandoned"`
  // is legal from any non-terminal phase. Otherwise the caller must have already submitted at
  // least once (so we know `last_passed`).
  async finish(opts: {
    outcome?: FinalOutcome;
    reveal_clicked?: boolean;
  }): Promise<UpdateProfileOutput> {
    const reveal_clicked = opts.reveal_clicked ?? false;
    const requestedAbandon = opts.outcome === "abandoned";

    if (requestedAbandon) {
      // Abandoned from idle is meaningless — treat as illegal so the API layer surfaces 409.
      if (this._state.phase === "idle" || this._state.phase === "done") {
        throw new IllegalTransitionError(this._state.phase, "finish");
      }
      const episode_id = this.requireEpisodeId();
      const out = await this.tools.updateProfile.run({
        episode_id,
        outcome: "abandoned",
        passed: false,
        reveal_clicked,
        submit_count: Math.max(1, this._state.attempts),
        hints_used: this._state.hints.length,
        finished_at_ms: this.now(),
        grader_rubric: this._lastGraderRubric,
      });
      this._state = this.toDoneState("abandoned");
      return out;
    }

    if (this._state.phase !== "grading" && this._state.phase !== "coding") {
      throw new IllegalTransitionError(this._state.phase, "finish");
    }

    const last_passed = this._state.phase === "grading" ? this._state.last_passed : false;
    const final_outcome =
      opts.outcome ??
      deriveFinalOutcome({
        passed: last_passed,
        hints_used: this._state.hints.length,
        reveal_clicked,
        abandoned: false,
      });

    const out = await this.tools.updateProfile.run({
      episode_id: this._state.episode_id,
      outcome: final_outcome,
      passed: last_passed,
      reveal_clicked,
      submit_count: Math.max(1, this._state.attempts),
      hints_used: this._state.hints.length,
      finished_at_ms: this.now(),
      grader_rubric: this._lastGraderRubric,
    });
    this._state = this.toDoneState(final_outcome);
    return out;
  }

  // STORY-015 — side-action planner. Lives outside the state machine: callable from any phase
  // (the /session UI fires it on mount, in parallel with the first assign()). Throws if the
  // harness wasn't constructed with a planSession tool — the caller chose to opt out.
  async planForToday(input: Omit<PlanSessionInput, "user_id">): Promise<PlanSessionOutput> {
    const tool = this.tools.planSession;
    if (!tool) {
      throw new Error("planForToday: planSession tool not configured on this TutorSession");
    }
    return tool.run({ ...input, user_id: this.user_id });
  }

  private requireEpisodeId(): string {
    if (this._state.phase === "idle" || this._state.phase === "abandoned") {
      throw new IllegalTransitionError(this._state.phase, "finish");
    }
    return this._state.episode_id;
  }

  private toDoneState(final_outcome: FinalOutcome): TutorState {
    if (
      this._state.phase === "idle" ||
      this._state.phase === "abandoned" ||
      this._state.phase === "done"
    ) {
      // Caller checked already — this branch keeps the type narrower happy.
      return this._state;
    }
    return {
      phase: "done",
      user_id: this.user_id,
      org_id: this.org_id,
      track_id: this.track_id,
      episode_id: this._state.episode_id,
      problem_id: this._state.problem_id,
      problem_slug: this._state.problem_slug,
      hints: this._state.hints,
      attempts: this._state.attempts,
      final_outcome,
    };
  }
}

import {
  IllegalTransitionError,
  type FinalOutcome,
  type HintRecord,
  type HintRung,
  type TutorState,
} from "./state.js";
import type { AssignProblemTool, AssignProblemOutput } from "./tools/assign-problem.js";
import type { GiveHintOutput, GiveHintTool } from "./tools/give-hint.js";
import type { GradeOutput, GradeTool } from "./tools/grade.js";
import type { UpdateProfileOutput, UpdateProfileTool } from "./tools/update-profile.js";
import { deriveFinalOutcome } from "./tools/update-profile.js";

export interface TutorSessionTools {
  assignProblem: AssignProblemTool;
  giveHint: GiveHintTool;
  grade: GradeTool;
  updateProfile: UpdateProfileTool;
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
  private _state: TutorState;

  constructor(opts: TutorSessionOptions) {
    this.user_id = opts.user_id;
    this.org_id = opts.org_id;
    this.track_id = opts.track_id;
    this.tools = opts.tools;
    this.now = opts.now ?? (() => Date.now());
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

  async assign(): Promise<AssignProblemOutput> {
    if (this._state.phase !== "idle" && this._state.phase !== "done") {
      throw new IllegalTransitionError(this._state.phase, "assign");
    }
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
    });
    this._state = this.toDoneState(final_outcome);
    return out;
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

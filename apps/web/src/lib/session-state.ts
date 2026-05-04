import type {
  AssignProblemOutput,
  GiveHintOutput,
  GradeOutput,
  HintRung,
  UpdateProfileOutput,
} from "@learnpro/agent";

// Pure, framework-free state machine for the /session client. The component imports `transition`
// and dispatches `SessionEvent`s; all branching lives here so it's unit-testable without React.
//
// The discriminated union mirrors the four /v1/tutor/episodes routes — `assigning` covers the
// initial POST, `submitting` / `grading` cover the round-trip through the grader, `hint_loading`
// covers a hint request, `finishing` covers the close-out POST. `coding` is the resting state
// the user spends most of their time in. `error` is sticky (the user dismisses or retries).

export interface AssignedProblem {
  episode_id: string;
  problem_id: string;
  problem_slug: string;
  problem: AssignProblemOutput["problem"];
  difficulty_tier: AssignProblemOutput["difficulty_tier"];
  why_this_difficulty: string;
  started_at: number;
}

export interface HintEntry {
  rung: HintRung;
  hint: string;
  xp_cost: number;
}

// Friendly inline banner — never blank-screens the page.
export interface SessionError {
  status: number;
  code: string;
  message: string;
}

export type SessionState =
  | { phase: "assigning" }
  | {
      phase: "coding";
      assigned: AssignedProblem;
      hints: HintEntry[];
      lastGrade: GradeOutput | null;
      lastError: SessionError | null;
    }
  | {
      phase: "hint_loading";
      assigned: AssignedProblem;
      hints: HintEntry[];
      lastGrade: GradeOutput | null;
      requestedRung: HintRung;
    }
  | {
      phase: "submitting";
      assigned: AssignedProblem;
      hints: HintEntry[];
      lastGrade: GradeOutput | null;
      submittedCode: string;
    }
  | {
      phase: "grading";
      assigned: AssignedProblem;
      hints: HintEntry[];
      grade: GradeOutput;
    }
  | {
      phase: "finishing";
      assigned: AssignedProblem;
      hints: HintEntry[];
      grade: GradeOutput | null;
    }
  | {
      phase: "finished";
      assigned: AssignedProblem;
      hints: HintEntry[];
      grade: GradeOutput | null;
      profile: UpdateProfileOutput;
    }
  | {
      phase: "error";
      error: SessionError;
      previous: SessionState | null;
    };

export type SessionEvent =
  | { type: "assign_started" }
  | { type: "assign_succeeded"; assigned: AssignedProblem }
  | { type: "assign_failed"; error: SessionError }
  | { type: "request_hint"; rung: HintRung }
  | { type: "hint_succeeded"; hint: HintEntry }
  | { type: "hint_failed"; error: SessionError }
  | { type: "submit"; code: string }
  | { type: "submit_succeeded"; grade: GradeOutput }
  | { type: "submit_failed"; error: SessionError }
  | { type: "finish" }
  | { type: "finish_succeeded"; profile: UpdateProfileOutput }
  | { type: "finish_failed"; error: SessionError }
  | { type: "dismiss_error" }
  | { type: "reset" };

export const initialSessionState: SessionState = { phase: "assigning" };

export class IllegalSessionEventError extends Error {
  readonly fromPhase: SessionState["phase"];
  readonly eventType: SessionEvent["type"];

  constructor(fromPhase: SessionState["phase"], eventType: SessionEvent["type"]) {
    super(`illegal session event "${eventType}" in phase "${fromPhase}"`);
    this.name = "IllegalSessionEventError";
    this.fromPhase = fromPhase;
    this.eventType = eventType;
  }
}

export function transition(state: SessionState, event: SessionEvent): SessionState {
  // `dismiss_error` and `reset` are universally legal — handle them up front.
  if (event.type === "dismiss_error") {
    if (state.phase === "error" && state.previous) return state.previous;
    if (state.phase === "error") return { phase: "assigning" };
    return state;
  }
  if (event.type === "reset") {
    return { phase: "assigning" };
  }

  switch (state.phase) {
    case "assigning":
      if (event.type === "assign_started") return state;
      if (event.type === "assign_succeeded") {
        return {
          phase: "coding",
          assigned: event.assigned,
          hints: [],
          lastGrade: null,
          lastError: null,
        };
      }
      if (event.type === "assign_failed") {
        return { phase: "error", error: event.error, previous: null };
      }
      throw new IllegalSessionEventError(state.phase, event.type);

    case "coding":
      if (event.type === "request_hint") {
        if (state.hints.length >= 3) {
          throw new IllegalSessionEventError(state.phase, event.type);
        }
        return {
          phase: "hint_loading",
          assigned: state.assigned,
          hints: state.hints,
          lastGrade: state.lastGrade,
          requestedRung: event.rung,
        };
      }
      if (event.type === "submit") {
        return {
          phase: "submitting",
          assigned: state.assigned,
          hints: state.hints,
          lastGrade: state.lastGrade,
          submittedCode: event.code,
        };
      }
      if (event.type === "finish") {
        return {
          phase: "finishing",
          assigned: state.assigned,
          hints: state.hints,
          grade: state.lastGrade,
        };
      }
      throw new IllegalSessionEventError(state.phase, event.type);

    case "hint_loading":
      if (event.type === "hint_succeeded") {
        return {
          phase: "coding",
          assigned: state.assigned,
          hints: [...state.hints, event.hint],
          lastGrade: state.lastGrade,
          lastError: null,
        };
      }
      if (event.type === "hint_failed") {
        return {
          phase: "coding",
          assigned: state.assigned,
          hints: state.hints,
          lastGrade: state.lastGrade,
          lastError: event.error,
        };
      }
      throw new IllegalSessionEventError(state.phase, event.type);

    case "submitting":
      if (event.type === "submit_succeeded") {
        return {
          phase: "grading",
          assigned: state.assigned,
          hints: state.hints,
          grade: event.grade,
        };
      }
      if (event.type === "submit_failed") {
        return {
          phase: "coding",
          assigned: state.assigned,
          hints: state.hints,
          lastGrade: state.lastGrade,
          lastError: event.error,
        };
      }
      throw new IllegalSessionEventError(state.phase, event.type);

    case "grading":
      // After the rubric is shown, the user can either iterate (back to coding) or finish.
      if (event.type === "submit") {
        return {
          phase: "submitting",
          assigned: state.assigned,
          hints: state.hints,
          lastGrade: state.grade,
          submittedCode: event.code,
        };
      }
      if (event.type === "request_hint") {
        if (state.hints.length >= 3) {
          throw new IllegalSessionEventError(state.phase, event.type);
        }
        return {
          phase: "hint_loading",
          assigned: state.assigned,
          hints: state.hints,
          lastGrade: state.grade,
          requestedRung: event.rung,
        };
      }
      if (event.type === "finish") {
        return {
          phase: "finishing",
          assigned: state.assigned,
          hints: state.hints,
          grade: state.grade,
        };
      }
      throw new IllegalSessionEventError(state.phase, event.type);

    case "finishing":
      if (event.type === "finish_succeeded") {
        return {
          phase: "finished",
          assigned: state.assigned,
          hints: state.hints,
          grade: state.grade,
          profile: event.profile,
        };
      }
      if (event.type === "finish_failed") {
        return { phase: "error", error: event.error, previous: state };
      }
      throw new IllegalSessionEventError(state.phase, event.type);

    case "finished":
      // Terminal except for `reset` (handled above) — anything else is illegal.
      throw new IllegalSessionEventError(state.phase, event.type);

    case "error":
      // `dismiss_error` / `reset` handled above; nothing else moves out of the error phase.
      throw new IllegalSessionEventError(state.phase, event.type);
  }
}

// XP cost text helper for the Hint button label. The XP value comes from the API response on
// previously-emitted hints; for the next rung we render a generic label until the API responds.
export function nextHintRung(hints: ReadonlyArray<HintEntry>): HintRung | null {
  if (hints.length === 0) return 1;
  if (hints.length === 1) return 2;
  if (hints.length === 2) return 3;
  return null;
}

// Friendly user-facing message for an HTTP failure response. The proxy returns a JSON envelope
// `{ error: code, message?: text }`; this maps it to a one-line banner.
export function friendlyError(
  status: number,
  body: { error?: string; message?: string },
): SessionError {
  const code = body.error ?? "request_failed";
  const message = body.message ?? defaultMessageFor(status, code);
  return { status, code, message };
}

function defaultMessageFor(status: number, code: string): string {
  if (status === 401) return "Your session expired — please sign in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) {
    if (code === "no_eligible_problem") {
      return "No problems available at this difficulty yet — try another track.";
    }
    if (code === "episode_not_found") {
      return "This episode isn't available anymore.";
    }
    return "Not found.";
  }
  if (status === 409) return "This action isn't valid in the current step — try refreshing.";
  if (status === 429) return "We've hit today's tutor budget — let's continue tomorrow.";
  if (status === 503) return "The tutor is briefly unavailable. Please try again in a moment.";
  if (status === 502) return "The tutor service is unreachable. Please try again shortly.";
  return "Something went wrong. Please try again.";
}

// Imported as a type-only re-export so consumers don't need to dig into @learnpro/agent themselves.
export type { GiveHintOutput };

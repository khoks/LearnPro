import type { HintRung } from "@learnpro/agent";
import {
  nextHintRung,
  transition,
  type HintEntry,
  type SessionEvent,
  type SessionState,
} from "./session-state";
import {
  assignEpisode,
  finishEpisode,
  requestHint,
  submitCode,
  type TutorApiOptions,
} from "./tutor-api";

// Pure orchestration layer: each entry point takes the current state, calls the right
// tutor-api wrapper, and returns BOTH the next state and the dispatched events. The component
// uses these functions inside its useReducer dispatch + state setters; integration tests use
// them directly with a fakeFetch to verify the full happy-path / error-path loops.
//
// Why a separate module: keeps SessionClient's React glue tiny (mount, telemetry, ref'd
// concurrency guards) and lets vitest exercise the full assign → submit → finish flow without
// jsdom + react-testing-library setup.

export interface DriverResult {
  state: SessionState;
  events: SessionEvent[];
}

function applyAll(initial: SessionState, events: SessionEvent[]): SessionState {
  return events.reduce<SessionState>((s, e) => transition(s, e), initial);
}

export async function driveAssign(
  current: SessionState,
  trackId: string,
  apiOpts?: TutorApiOptions,
): Promise<DriverResult> {
  const events: SessionEvent[] = [{ type: "assign_started" }];
  const r = await assignEpisode({ track_id: trackId }, apiOpts ?? {});
  if (!r.ok) {
    events.push({ type: "assign_failed", error: r.error });
  } else {
    events.push({
      type: "assign_succeeded",
      assigned: {
        episode_id: r.data.episode_id,
        problem_id: r.data.problem_id,
        problem_slug: r.data.problem_slug,
        problem: r.data.problem,
        difficulty_tier: r.data.difficulty_tier,
        why_this_difficulty: r.data.why_this_difficulty,
        started_at: r.data.started_at,
      },
    });
  }
  return { state: applyAll(current, events), events };
}

export async function driveSubmit(
  current: SessionState,
  code: string,
  apiOpts?: TutorApiOptions,
): Promise<DriverResult> {
  if (current.phase !== "coding" && current.phase !== "grading") {
    throw new Error(`driveSubmit: illegal from phase=${current.phase}`);
  }
  const episode_id = current.assigned.episode_id;
  const events: SessionEvent[] = [{ type: "submit", code }];
  const r = await submitCode(episode_id, code, apiOpts ?? {});
  if (!r.ok) {
    events.push({ type: "submit_failed", error: r.error });
  } else {
    events.push({ type: "submit_succeeded", grade: r.data });
  }
  return { state: applyAll(current, events), events };
}

export async function driveHint(
  current: SessionState,
  rung: HintRung,
  apiOpts?: TutorApiOptions,
): Promise<DriverResult> {
  if (current.phase !== "coding" && current.phase !== "grading") {
    throw new Error(`driveHint: illegal from phase=${current.phase}`);
  }
  const episode_id = current.assigned.episode_id;
  const events: SessionEvent[] = [{ type: "request_hint", rung }];
  const r = await requestHint(episode_id, rung, apiOpts ?? {});
  if (!r.ok) {
    events.push({ type: "hint_failed", error: r.error });
  } else {
    const hint: HintEntry = { rung: r.data.rung, hint: r.data.hint, xp_cost: r.data.xp_cost };
    events.push({ type: "hint_succeeded", hint });
  }
  return { state: applyAll(current, events), events };
}

export async function driveFinish(
  current: SessionState,
  apiOpts?: TutorApiOptions,
): Promise<DriverResult> {
  if (current.phase !== "coding" && current.phase !== "grading") {
    throw new Error(`driveFinish: illegal from phase=${current.phase}`);
  }
  const episode_id = current.assigned.episode_id;
  const events: SessionEvent[] = [{ type: "finish" }];
  const r = await finishEpisode(episode_id, {}, apiOpts ?? {});
  if (!r.ok) {
    events.push({ type: "finish_failed", error: r.error });
  } else {
    events.push({ type: "finish_succeeded", profile: r.data });
  }
  return { state: applyAll(current, events), events };
}

// Re-exported for tests that want to verify "next-rung label" externally.
export { nextHintRung };

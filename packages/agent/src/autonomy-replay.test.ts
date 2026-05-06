import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EwmaBandedAutonomyPolicy, type ConfidenceSignal } from "@learnpro/scoring";
import {
  AUTONOMY_ACTION_CONSEQUENCE,
  TutorSession,
  type AutonomyActionKind,
  type TutorSessionTools,
} from "./tutor-session.js";
import type { AssignProblemTool } from "./tools/assign-problem.js";
import type { GiveHintTool } from "./tools/give-hint.js";
import type { GradeTool } from "./tools/grade.js";
import type { UpdateProfileTool } from "./tools/update-profile.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(HERE, "..", "test", "fixtures");

interface ReplayWindow {
  name: string;
  episode_count: number;
  signal: ConfidenceSignal | null;
  expectations: Array<{
    step: number;
    kind: AutonomyActionKind;
    expect_band: "low" | "medium" | "high";
    expect_decision: "ask" | "execute" | "ask_freeform";
  }>;
}

interface ReplayFixture {
  name: string;
  description: string;
  user_id: string;
  org_id: string;
  track_id: string;
  windows: ReplayWindow[];
  summary: {
    total_steps: number;
    low_band_steps: number;
    medium_band_steps: number;
    high_band_steps: number;
  };
}

function loadFixture(name: string): ReplayFixture {
  const file = path.join(FIXTURES_DIR, `${name}.json`);
  const raw = readFileSync(file, "utf8");
  return JSON.parse(raw) as ReplayFixture;
}

function noopTools(): TutorSessionTools {
  const assignProblem: AssignProblemTool = {
    name: "assignProblem",
    async run() {
      throw new Error("not used in autonomy replay");
    },
  };
  const giveHint: GiveHintTool = {
    name: "giveHint",
    async run() {
      throw new Error("not used in autonomy replay");
    },
  };
  const grade: GradeTool = {
    name: "grade",
    async run() {
      throw new Error("not used in autonomy replay");
    },
  };
  const updateProfile: UpdateProfileTool = {
    name: "updateProfile",
    async run() {
      throw new Error("not used in autonomy replay");
    },
  };
  return { assignProblem, giveHint, grade, updateProfile };
}

describe("replay-002-autonomy (STORY-054)", () => {
  it("plays the 20-step autonomy band progression and matches every expectation", async () => {
    const fixture = loadFixture("replay-002-autonomy");
    expect(fixture.summary.total_steps).toBe(20);
    let stepsSeen = 0;

    for (const window of fixture.windows) {
      const policy = new EwmaBandedAutonomyPolicy({
        getSignal: async () => window.signal,
      });
      const session = new TutorSession({
        user_id: fixture.user_id,
        org_id: fixture.org_id,
        track_id: fixture.track_id,
        tools: noopTools(),
        autonomyPolicy: policy,
        episode_count: window.episode_count,
      });

      for (const exp of window.expectations) {
        const advice = await session.consultAutonomy(exp.kind);
        expect(advice, `step ${exp.step}: advice should be present`).not.toBeNull();
        expect(
          advice!.decision.band,
          `step ${exp.step} (${exp.kind}) in window ${window.name} expected band=${exp.expect_band}, got ${advice!.decision.band}`,
        ).toBe(exp.expect_band);
        expect(
          advice!.decision.decision,
          `step ${exp.step} (${exp.kind}) in window ${window.name} expected decision=${exp.expect_decision}, got ${advice!.decision.decision}`,
        ).toBe(exp.expect_decision);
        stepsSeen += 1;
      }
    }

    expect(stepsSeen).toBe(fixture.summary.total_steps);
  });

  it("counts the band-segment lengths from the fixture summary", () => {
    const fixture = loadFixture("replay-002-autonomy");
    const total =
      fixture.summary.low_band_steps +
      fixture.summary.medium_band_steps +
      fixture.summary.high_band_steps;
    expect(total).toBe(fixture.summary.total_steps);
    expect(fixture.summary.low_band_steps).toBeGreaterThan(0);
    expect(fixture.summary.medium_band_steps).toBeGreaterThan(0);
    expect(fixture.summary.high_band_steps).toBeGreaterThan(0);
  });

  it("the consequence map is well-known to the AutonomyActionKind discriminator", () => {
    expect(AUTONOMY_ACTION_CONSEQUENCE["assign-next-problem"]).toBe("trivial");
    expect(AUTONOMY_ACTION_CONSEQUENCE["proactive-hint"]).toBe("consequential");
    expect(AUTONOMY_ACTION_CONSEQUENCE["auto-set-final-outcome"]).toBe("consequential");
    expect(AUTONOMY_ACTION_CONSEQUENCE["switch-track"]).toBe("disruptive");
  });

  it("consultAutonomy returns null when no policy is wired (AlwaysConfirm baseline)", async () => {
    const session = new TutorSession({
      user_id: "11111111-1111-4111-8111-111111111111",
      org_id: "self",
      track_id: "22222222-2222-4222-8222-222222222222",
      tools: noopTools(),
    });
    const advice = await session.consultAutonomy("assign-next-problem");
    expect(advice).toBeNull();
  });
});

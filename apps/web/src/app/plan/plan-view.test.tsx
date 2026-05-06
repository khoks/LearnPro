import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PlanReasoningPanel,
  ThisWeekDeferredStub,
  TodayPlanFullView,
  TodayPlanSummaryCard,
  type TodayPlanShape,
} from "./plan-view.js";

void React;

// Render-to-string the pure components and grep their output for the wanted (and unwanted)
// copy. Same pattern as `dashboard-components.test.tsx` — these components have no events /
// state / refs to test, just shape + copy. The PlanClient (the only stateful piece) is tested
// separately.

const FORBIDDEN_PHRASES = [
  // EPIC-011 anti-dark-pattern table — these are the strings the plan UI must never render.
  "DON'T LOSE",
  "DAY X",
  "burn",
  "BURN",
  "🔥",
  "⚠️",
];

function assertNoForbiddenPhrases(rendered: string): void {
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(
      rendered,
      `plan UI must not contain forbidden phrase "${phrase}" (EPIC-011 anti-dark-pattern stance)`,
    ).not.toContain(phrase);
  }
}

function makePlan(overrides: Partial<TodayPlanShape> = {}): TodayPlanShape {
  return {
    date: "2026-04-29",
    review_items: [],
    session_plan_items: [],
    episodes_today_count: 0,
    session_plan_id: null,
    dampening: {},
    ...overrides,
  };
}

describe("TodayPlanSummaryCard", () => {
  it("renders the empty-state message when the plan is null", () => {
    const out = renderToStaticMarkup(
      <TodayPlanSummaryCard plan={null} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain("Today&#x27;s plan is empty.");
    expect(out).toContain("Open the planner to start a quick session.");
    expect(out).toContain('href="/plan"');
  });

  it("renders the empty-state message when both review and session items are empty", () => {
    const out = renderToStaticMarkup(
      <TodayPlanSummaryCard plan={makePlan()} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain("Today&#x27;s plan is empty.");
  });

  it("renders review-only counts when only reviews are present", () => {
    const plan = makePlan({
      review_items: [
        { concept_id: "c-a", due: "2026-04-28T10:00:00Z", days_overdue: 1, reasoning: "" },
        { concept_id: "c-b", due: "2026-04-27T10:00:00Z", days_overdue: 2, reasoning: "" },
      ],
    });
    const out = renderToStaticMarkup(
      <TodayPlanSummaryCard plan={plan} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain("2 concepts ready for review");
  });

  it("renders session-plan-only counts when only session items are present", () => {
    const plan = makePlan({
      session_plan_id: "22222222-2222-4222-8222-222222222222",
      session_plan_items: [
        {
          slug: "warmup",
          objective: "Warm up",
          estimated_duration_min: 8,
          status: "pending",
          reasoning: "",
        },
        {
          slug: "drill",
          objective: "Drill",
          estimated_duration_min: 10,
          status: "pending",
          reasoning: "",
        },
      ],
    });
    const out = renderToStaticMarkup(
      <TodayPlanSummaryCard plan={plan} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain("2 session items to work on");
  });

  it("renders mixed counts when both reviews and session items are present", () => {
    const plan = makePlan({
      review_items: [
        { concept_id: "c-a", due: "2026-04-28T10:00:00Z", days_overdue: 1, reasoning: "" },
      ],
      session_plan_id: "22222222-2222-4222-8222-222222222222",
      session_plan_items: [
        {
          slug: "warmup",
          objective: "Warm up",
          estimated_duration_min: 8,
          status: "completed",
          reasoning: "",
        },
        {
          slug: "drill",
          objective: "Drill",
          estimated_duration_min: 10,
          status: "pending",
          reasoning: "",
        },
      ],
    });
    const out = renderToStaticMarkup(
      <TodayPlanSummaryCard plan={plan} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain("1 concept ready for review");
    expect(out).toContain("1 of 2 session items left");
  });

  it("Start-a-session link goes to /session?track=... when an active track is supplied", () => {
    const out = renderToStaticMarkup(
      <TodayPlanSummaryCard plan={makePlan()} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain('href="/session?track=python-fundamentals"');
  });

  it("Start-a-session link goes to /session when no active track", () => {
    const out = renderToStaticMarkup(
      <TodayPlanSummaryCard plan={makePlan()} activeTrackSlug={null} />,
    );
    expect(out).toContain('href="/session"');
  });

  it("contains no forbidden dark-pattern phrases", () => {
    const variants: TodayPlanShape[] = [
      makePlan(),
      makePlan({
        review_items: [
          { concept_id: "c", due: "2026-04-28T10:00:00Z", days_overdue: 1, reasoning: "" },
        ],
      }),
      makePlan({
        session_plan_items: [
          {
            slug: "x",
            objective: "X",
            estimated_duration_min: 8,
            status: "pending",
            reasoning: "",
          },
        ],
      }),
    ];
    for (const p of variants) {
      assertNoForbiddenPhrases(
        renderToStaticMarkup(
          <TodayPlanSummaryCard plan={p} activeTrackSlug="python-fundamentals" />,
        ),
      );
    }
  });
});

describe("TodayPlanFullView", () => {
  it("renders 'Nothing due' when the review queue is empty", () => {
    const out = renderToStaticMarkup(
      <TodayPlanFullView plan={makePlan()} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain("Nothing due right now");
  });

  it("renders 'No active session plan' when the session-plan list is empty", () => {
    const out = renderToStaticMarkup(
      <TodayPlanFullView plan={makePlan()} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain("No active session plan yet");
  });

  it("renders review concept ids and days-overdue badges", () => {
    const plan = makePlan({
      review_items: [
        {
          concept_id: "concept-tuples",
          due: "2026-04-28T10:00:00Z",
          days_overdue: 1,
          reasoning: "",
        },
        {
          concept_id: "concept-list-comp",
          due: "2026-04-27T10:00:00Z",
          days_overdue: 2,
          reasoning: "",
        },
      ],
    });
    const out = renderToStaticMarkup(
      <TodayPlanFullView plan={plan} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain("concept-tuples");
    expect(out).toContain("concept-list-comp");
    expect(out).toContain("1 day ago");
    expect(out).toContain("2 days ago");
    expect(out).toContain("Review queue · 2 ready");
  });

  it("renders session-plan items with strikethrough on completed", () => {
    const plan = makePlan({
      session_plan_items: [
        {
          slug: "done-one",
          objective: "Already finished",
          estimated_duration_min: 5,
          status: "completed",
          reasoning: "",
        },
        {
          slug: "todo-one",
          objective: "Still to do",
          estimated_duration_min: 12,
          status: "pending",
          reasoning: "",
        },
      ],
    });
    const out = renderToStaticMarkup(
      <TodayPlanFullView plan={plan} activeTrackSlug="python-fundamentals" />,
    );
    expect(out).toContain("Already finished");
    expect(out).toContain("Still to do");
    expect(out).toContain("Session plan · 1 of 2 pending");
    expect(out).toMatch(/data-status="completed"[^>]*line-through/);
  });

  it("Start-a-session link respects the active track", () => {
    const out = renderToStaticMarkup(
      <TodayPlanFullView plan={makePlan()} activeTrackSlug="typescript-fundamentals" />,
    );
    expect(out).toContain('href="/session?track=typescript-fundamentals"');
  });

  it("always includes the ThisWeek deferred stub explaining STORY-032 dependency", () => {
    const out = renderToStaticMarkup(
      <TodayPlanFullView plan={makePlan()} activeTrackSlug={null} />,
    );
    expect(out).toContain("Weekly themed plans land alongside the knowledge-graph work");
    expect(out).toContain("STORY-032");
  });

  it("contains no forbidden dark-pattern phrases across variants", () => {
    const variants = [
      makePlan(),
      makePlan({
        review_items: [
          { concept_id: "c", due: "2026-04-28T10:00:00Z", days_overdue: 5, reasoning: "" },
        ],
        session_plan_items: [
          {
            slug: "x",
            objective: "X",
            estimated_duration_min: 8,
            status: "pending",
            reasoning: "",
          },
        ],
      }),
    ];
    for (const p of variants) {
      assertNoForbiddenPhrases(
        renderToStaticMarkup(
          <TodayPlanFullView plan={p} activeTrackSlug="python-fundamentals" />,
        ),
      );
    }
  });
});

describe("ThisWeekDeferredStub", () => {
  it("explains the deferral to STORY-032 (knowledge graph)", () => {
    const out = renderToStaticMarkup(<ThisWeekDeferredStub />);
    expect(out).toContain("This week");
    expect(out).toContain("knowledge-graph");
    expect(out).toContain("STORY-032");
  });

  it("does not fake any weekly content", () => {
    const out = renderToStaticMarkup(<ThisWeekDeferredStub />);
    // Sanity: no day-of-week list, no theme name, no "Monday: ..." strings.
    expect(out).not.toMatch(/Monday:|Tuesday:|Wednesday:|Thursday:|Friday:/);
  });

  it("contains no forbidden dark-pattern phrases", () => {
    assertNoForbiddenPhrases(renderToStaticMarkup(<ThisWeekDeferredStub />));
  });
});

describe("PlanReasoningPanel (AC #6 advanced toggle)", () => {
  it("renders a `<details>` element so it's keyboard-accessible without JS", () => {
    const out = renderToStaticMarkup(<PlanReasoningPanel plan={makePlan()} />);
    expect(out).toContain("<details");
    expect(out).toContain("</details>");
    expect(out).toContain("Show planner reasoning (advanced)");
  });

  it("emits a 'no reasoning' message when the plan is empty", () => {
    const out = renderToStaticMarkup(<PlanReasoningPanel plan={makePlan()} />);
    expect(out).toContain("No reasoning to show");
  });

  it("emits review reasoning when reviews are present", () => {
    const plan = makePlan({
      review_items: [
        {
          concept_id: "concept-tuples",
          due: "2026-04-28T10:00:00Z",
          days_overdue: 1,
          reasoning: "Due 1 day ago — a short review will bring it back.",
        },
      ],
    });
    const out = renderToStaticMarkup(<PlanReasoningPanel plan={plan} />);
    expect(out).toContain("Why these reviews?");
    expect(out).toContain("Due 1 day ago");
    expect(out).toContain("concept-tuples");
  });

  it("emits session-plan reasoning when session items are present", () => {
    const plan = makePlan({
      session_plan_items: [
        {
          slug: "warmup",
          objective: "Warm up",
          estimated_duration_min: 8,
          status: "pending",
          reasoning: "Picked by your session planner: Warm up",
        },
      ],
    });
    const out = renderToStaticMarkup(<PlanReasoningPanel plan={plan} />);
    expect(out).toContain("Why these session items?");
    expect(out).toContain("Picked by your session planner");
    expect(out).toContain("warmup");
  });

  it("emits both reasoning sections when both reviews and session items are present", () => {
    const plan = makePlan({
      review_items: [
        {
          concept_id: "c",
          due: "2026-04-28T10:00:00Z",
          days_overdue: 1,
          reasoning: "Due today",
        },
      ],
      session_plan_items: [
        {
          slug: "x",
          objective: "X",
          estimated_duration_min: 8,
          status: "pending",
          reasoning: "Picked by your session planner: X",
        },
      ],
    });
    const out = renderToStaticMarkup(<PlanReasoningPanel plan={plan} />);
    expect(out).toContain("Why these reviews?");
    expect(out).toContain("Why these session items?");
  });

  it("contains no forbidden dark-pattern phrases", () => {
    const plan = makePlan({
      review_items: [
        {
          concept_id: "c",
          due: "2026-04-28T10:00:00Z",
          days_overdue: 5,
          reasoning: "Due 5 days ago — a few minutes here will keep this concept solid.",
        },
      ],
      session_plan_items: [
        {
          slug: "x",
          objective: "X",
          estimated_duration_min: 8,
          status: "pending",
          reasoning: "Picked by your session planner: X",
        },
      ],
    });
    assertNoForbiddenPhrases(renderToStaticMarkup(<PlanReasoningPanel plan={plan} />));
  });
});

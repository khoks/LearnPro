---
id: STORY-038a
title: Tutor route fan-out for the comprehension problem kind
type: story
status: in-progress
priority: P1
estimate: M
parent: EPIC-007
phase: v1-followup
tags: [problems, comprehension, tutor, agent, v1-followup]
created: 2026-05-06
updated: 2026-05-06
---

## Description

Deferred follow-up from [STORY-038](STORY-038-read-this-code-exercises.md). STORY-038 shipped
the comprehension problem schema (`kind: "comprehension"`), 68 problem YAMLs (38 Python + 30 TS),
the `gradeComprehension` agent, the `<ComprehensionProblemPanel>` UI, and the
`comprehension-policy.ts` skill axis. What it left out — intentionally, to keep the discriminated
assign/grade fan-out a separate change — is the runtime wiring that surfaces comprehension problems
through the tutor route end-to-end.

This Story closes that gap. The assigner now surfaces comprehension problems alongside implement +
debug. The grade tool fan-outs by `episode.problem.kind`: implement/debug stay on the existing
hidden-tests-as-floor + grader-rubric path; comprehension routes to `gradeComprehension`. The
submit route accepts the union answer shape (multiple-choice index OR free-text string). The
comprehension-policy EWMA fires on close, mirroring how the bug-finding-policy hooks in.

References [STORY-034](STORY-034-critique-agent-split.md) (split-grader pattern reused here for
the dispatch shape) and [STORY-037a](STORY-037a-debug-grader-runtime-wiring.md) (sibling debug
runtime-wiring pattern).

## Acceptance criteria

- [ ] `createAssignProblemTool` returns comprehension problems too (when the catalog has them and
      the difficulty/concept ranking favors them — same `pickCandidate` rules apply).
- [ ] `assign-problem` projection supports the comprehension shape — `question`,
      `comprehension_format`, `answer_format`, `multiple_choice_options`, `correct_answer_index`,
      `explanation` — added to `AssignProblemOutputSchema`.
- [ ] `createGradeTool` dispatches to `gradeComprehension` when `episode.problem.kind ===
      "comprehension"`.
- [ ] The `submit` route in `apps/api/src/tutor.ts` accepts the comprehension answer shape
      (multiple-choice index OR free-text string) AND routes the response correctly.
- [ ] Tutor commentary on a passed comprehension problem references the problem's `explanation`
      field (already in STORY-038's `buildComprehensionCommentary` but un-wired without route
      fan-out).
- [ ] `comprehension-policy.ts` skill axis is updated when a comprehension problem is graded —
      wired into `update-profile.ts` via a new optional dep so a passing comprehension submission
      bumps the per-concept-tag EWMA.
- [ ] All existing implement+debug tests still pass.

## Implementation outline

1. `packages/agent/src/tools/assign-problem.ts`:
   - Loosen `AssignProblemOutputSchema.problem.kind` to `z.enum(["implement", "debug",
     "comprehension"])`.
   - Make `public_examples`, `bug_archetype`, `expected_behavior`, `starter_code` etc.
     optional/nullable in the projection where they don't apply to comprehension.
   - Add comprehension-specific fields: `question?: string`, `comprehension_format?: enum`,
     `answer_format?: enum`, `multiple_choice_options?: string[]`,
     `correct_answer_index?: number`, `explanation?: string`.
   - Update `projectProblem` to handle the comprehension branch (no more `throw new
     Error(...uses a separate route)`).
2. `packages/agent/src/tools/grade.ts`:
   - Detect `episode.problem.kind === "comprehension"` and route to `gradeComprehension`.
   - The grade input shape accepts either `code: string` (implement/debug) OR
     `comprehension_answer: { kind: "multiple_choice"; selected_index } | { kind: "free_text";
     text }`.
   - Output carries an optional `comprehension` block (`correct`, `reasoning`, `explanation`,
     `fallback_used`).
3. `apps/api/src/tutor.ts`:
   - Widen the `POST /v1/tutor/episodes/:id/submit` body schema to the union.
   - Tutor commentary surfaces the `comprehension.explanation` on pass via the existing
     `buildComprehensionCommentary` helper.
4. `packages/scoring/src/policies/comprehension-policy.ts`:
   - Wire the existing pure function into `update-profile.ts` via a new optional
     `upsertComprehensionScore` dep so a passing comprehension submission bumps the axis.
5. `apps/web/src/app/session/`: minimal — the `<ComprehensionProblemPanel>` already reads from
   the assign output; verify the wiring works end-to-end.

## Pattern

Per the parent ticket, ships in 5 commits:

1. AssignProblemOutputSchema widening + tests
2. Grade tool dispatch + tests
3. Submit-route comprehension routing + tests
4. comprehension-policy wire-in to update-profile + tests
5. STORY-038a + BOARD.md + PR

## Dependencies

- Blocked by: [STORY-038](STORY-038-read-this-code-exercises.md) (provides the schema, agent,
  policy, and UI components).
- Pairs with: [STORY-037a](STORY-037a-debug-grader-runtime-wiring.md) (sibling runtime-wiring
  follow-up; same fan-out pattern).

## Activity log

- 2026-05-06 — created
- 2026-05-06 — picked up

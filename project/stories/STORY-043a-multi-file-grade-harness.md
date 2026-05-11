---
id: STORY-043a
title: Multi-file grade-tool harness
type: story
status: done
priority: P1
estimate: S
parent: EPIC-003
phase: v1-followup
tags: [sandbox, grader, agent, multi-file, v1-followup]
created: 2026-05-06
updated: 2026-05-11
---

## Description

Deferred follow-up from [STORY-043](STORY-043-multi-file-workspaces.md). STORY-043 shipped
multi-file workspaces in the sandbox + editor + validator path: `SandboxRunRequest` accepts
`files: Array<{path, content}>`; `@learnpro/problems` schema gained `starter_workspace` +
`entry_file`; `<FileTreeSidebar>` renders the workspace; `validateProblems` wires
`buildMultiFileHarnessForProblem` so cross-file imports resolve in the seed-bank smoke tests.

What it didn't ship — intentionally, to keep the seed-bank-self-validation change separable from
the agent-runtime change — is the multi-file harness wired into the **grade tool**. Today, when
a user submits a multi-file workspace, only the entry file's content reaches the sandbox; the
auxiliary files (`lib/__init__.py`, `lib/utils.py`, etc.) are dropped on the floor and the user
sees `ImportError: No module named 'lib'`.

This story closes that gap. The grade tool's `runHiddenTests` adapter now uses
`buildMultiFileHarnessForProblem` when the problem ships a `starter_workspace` and forwards the
full file tree to the sandbox via STORY-043's `files: [...]` shape. The `submit` body schema
widens to accept either the legacy `{ code: string }` (single-file) or `{ files: [{path,content},...] }`
(multi-file). The browser ships `files` whenever the workspace has more than one file.

References [STORY-043](STORY-043-multi-file-workspaces.md) (the multi-file workspace shape) and
[STORY-038a](STORY-038a-comprehension-tutor-fanout.md) (sibling pattern for widening the submit
body to a Zod union).

## Acceptance criteria

- [ ] `GradeInputSchema` accepts a `{ episode_id, files: SandboxWorkspaceFile[] }` shape as a
      third arm of the existing union (alongside `{ code }` and `{ comprehension_answer }`).
      Existing single-file submissions still validate.
- [ ] `runHiddenTests` in `buildGradeDrizzleDeps` detects `input.problem.starter_workspace`. When
      multi-file, it calls `buildMultiFileHarnessForProblem(problem, userEntryContent, test)`
      and ships `files: [...]` to the sandbox; when single-file, it falls through to the
      existing `buildHarnessForProblem` + `code` shape.
- [ ] When the user submits multi-file, the entry file's content is replaced with the harness;
      every other authored file ships verbatim alongside it. Cross-file imports resolve in the
      sandbox.
- [ ] `apps/api/src/tutor.ts` submit route accepts the multi-file body shape. Zod union widens
      to `{ code }` | `{ comprehension_answer }` | `{ files }`. PII redaction is applied to each
      file's content (URLs preserved; emails / phones / cards scrubbed).
- [ ] `apps/web/src/lib/tutor-api.ts` exposes `submitMultiFile(episode_id, files)`. The
      SessionClient wires it: when the workspace has > 1 file, ship `files`; else ship `code`.
      Pure single-file workspaces stay on the legacy path (no behavioural change).
- [ ] `submit()` on `TutorSession` accepts a multi-file argument shape (mirrors the route
      schema). The state-machine driver passes through unchanged.
- [ ] Tests cover: submit-multi-file → sandbox sees auxiliary files; submit-single-file → still
      works; the entry-file convention is honored; the harness output replaces the entry file's
      content; legacy `code` shape continues to validate.

## Out of scope

- Re-shaping `SandboxProvider` — STORY-043 already extended it to accept multi-file requests.
- Multi-file debug problems — `kind: "debug"` continues to be single-file-only at the schema
  level. (`buildMultiFileHarnessForProblem` already short-circuits when
  `def.kind !== "implement"`.)
- Path validation — the sandbox already enforces `WORKSPACE_PATH` regex on incoming files; the
  grade route piggy-backs on Zod parsing through `SandboxWorkspaceFileSchema`.

## Activity

- 2026-05-06 — picked up

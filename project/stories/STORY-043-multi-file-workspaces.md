---
id: STORY-043
title: Multi-file workspaces in sandbox + editor
type: story
status: done
priority: P0
estimate: L
parent: EPIC-003
phase: v1
tags: [sandbox, workspaces, frameworks, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

MVP is single-file solve. v1 needs multi-file because real engineering is multi-file — and because every framework starter (React, Express, FastAPI) requires multi-file workspaces.

Add a virtual filesystem in the sandbox container, a file-tree sidebar in the UI, language-aware module/import resolution, and per-language reasonable defaults (e.g., a `package.json` for TS, a `requirements.txt` for Python).

## Acceptance criteria

- [x] Sandbox supports multi-file workspaces (file tree persisted across runs within a session — workspace lives in component state, lost on reload as per Notes).
- [x] Editor has a file-tree sidebar (flat list — see decision in "Notes" below). User can create / rename / delete files; entry-file pin via inline button.
- [x] Language-aware module resolution works (Python `import` resolves from cwd; TS `import` from sibling .ts files via Piston's typescript runtime which uses ts-node).
- [x] Per-language entry-point convention documented as `ENTRY_FILE_BY_LANGUAGE` (Python: `main.py`, TS: `index.ts`).
- [x] Hidden tests can be multi-file too — `buildMultiFileHarnessForProblem()` ships the entry harness + auxiliary files via the multi-file `files[]` shape; `validateProblems` uses it when a problem has `starter_workspace`.
- [x] Run/Submit buttons work the same way; Run packages the entire workspace into the sandbox request.  Submit currently ships only the entry file's content (the agent's grade tool's multi-file harness extension is a deferred follow-up — see "Notes" below).
- [x] Per-problem "starter workspace" can be defined in the problem YAML — implement-kind problems gain optional `starter_workspace: Array<{path, content}>` + `entry_file` fields.  3 example workspace problems land in the seed bank.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-003 MVP one-shot sandbox (STORY-007/STORY-008/STORY-010).
- Enables: framework starters, project-based learning ([STORY-048](STORY-048-project-based-learning.md)).

## Notes

- Decision: stick with one-shot containers per Run (snapshot the workspace each time) for v1, OR move to long-lived per-user containers (mount the workspace as a volume). Trade-off: one-shot is simpler + safer; long-lived is faster + needs lifecycle management. **Implementation: one-shot.**
- Decision: file tree is a **flat sorted list** (not a real nested tree). Rationale: typical workspaces (≤6 files) stay shallow; flat is faster to render, easier to keyboard-nav, and avoids the indent-management UI noise.  A real tree can land later if we ship project-based learning (STORY-048) and workspaces grow.
- Decision: drag-and-drop reordering deferred to a follow-up; v1 has text-only actions (create / rename / delete / set-entry).
- Decision: agent grade tool's multi-file harness is a deferred follow-up — `buildMultiFileHarnessForProblem` already exists in `@learnpro/problems` for the validator path, but `packages/agent/src/tools/grade.ts` still uses the single-file harness.  Submit currently ships the entry file's content unchanged.  When the agent path picks up the multi-file harness, the workspace's auxiliary files will flow through automatically (the `assigned.problem.starter_workspace` is already pre-populated on the editor side).
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
- 2026-05-06 — picked up; sandbox `SandboxRunRequest` extended to accept `files: Array<{path, content}>` with a backward-compat preprocess for the legacy `code` shorthand. Per-language entry-file convention exposed as `ENTRY_FILE_BY_LANGUAGE` (`python: main.py`, `typescript: index.ts`). Piston provider reorders the entry file to `files[0]` so Piston's default-first-file run rule picks it up.
- 2026-05-06 — `@learnpro/problems` schema extended: implement-kind problems gain optional `starter_workspace` + `entry_file` (debug-kind unchanged). New `buildMultiFileHarnessForProblem()` returns the entry harness + auxiliary files for `validateProblems` to ship via the multi-file sandbox shape. 3 multi-file example problems authored under `python/workspace-utils-import.yaml`, `typescript/workspace-math-module.yaml`, `typescript/workspace-types-and-impl.yaml`.
- 2026-05-06 — `apps/web/src/components/editor/file-tree-state.ts` pure reducer with create / rename / delete / set_active / set_content / set_entry / replace actions. `FileTreeSidebar.tsx` flat-list view with active highlight, entry badge, inline rename, trash with disabled-on-last-file. PlaygroundClient + SessionClient swap their single-file `code` useState for a workspace useReducer. Run packages the full workspace via `toSandboxFiles()`. SessionClient's `assign_succeeded` seeds the workspace from `starter_workspace` (multi-file) or wraps `starter_code` in a 1-file workspace. Submit ships the entry file's content (multi-file grade-tool harness is a deferred follow-up).
- 2026-05-06 — done. 19 new tests on the sandbox path (9 piston + 10 problems schema/validate), 28 new state tests (file-tree-state) + 14 new component tests (FileTreeSidebar) + 1 multi-file route test in apps/web + 2 multi-file route tests in apps/api. 582 web tests pass, 276 api tests pass, 62 problems tests pass, 62 sandbox tests pass.

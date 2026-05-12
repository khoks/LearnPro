---
id: STORY-064
title: Fix Windows isMain check in apps/api/src/index.ts (silent server failure on Windows)
type: story
status: in-progress
priority: P0
estimate: XS
parent: EPIC-019
phase: scaffolding
tags: [bug, windows, dev-experience]
created: 2026-05-11
updated: 2026-05-11
---

## Description

The `start()` invocation at the bottom of `apps/api/src/index.ts` is gated on:

```ts
const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
```

On Windows this is ALWAYS false. `import.meta.url` for an absolute Windows path is `file:///D:/...` (three slashes) but the manual construction produces `file://D:/...` (two slashes). The dev server starts silently, never calls `app.listen`, never logs anything, and Chrome's localhost:4000 just refuses connections. Caught during the 2026-05-11 Chrome walkthrough; no automated test ever exercised the entrypoint because `start()` is only ever invoked via the running process.

## Acceptance criteria

- [x] Replace the hand-rolled URL comparison with Node's `url.pathToFileURL(process.argv[1]).href`. Both Windows and POSIX produce the canonical `file:///…` form, so the check works on both.
- [x] `pnpm --filter @learnpro/api dev` on a fresh Windows clone logs `Server listening at http://0.0.0.0:4000` within ~5 s of startup.
- [ ] (Optional follow-up) Add an apps/api e2e test that spawns the server via the dev script and waits for `/health` to return 200 — would catch this class of bug.

## Dependencies

None.

## Notes

Fixed inline during the Chrome walkthrough; lands via a chore PR. The optional e2e test is filed for a future session but not blocking this Story's close.

## Activity log

- 2026-05-11 — created + in-progress. Found during /option 1/ Chrome walkthrough — API server silently refused connections on Windows. Patched `apps/api/src/index.ts` to use `pathToFileURL`. Lands via chore PR.

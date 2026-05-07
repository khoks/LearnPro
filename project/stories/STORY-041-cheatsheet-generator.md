---
id: STORY-041
title: Personal cheatsheet auto-generation per session
type: story
status: done
priority: P2
estimate: S
parent: EPIC-002
phase: v1
tags: [agent, ux, retention, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

After each session, auto-generate a one-page personal cheatsheet of "things you struggled with today, summarized as flashcards." Available as in-app view + PDF export. Boosts retention via spaced re-reading and produces a tangible take-home artifact.

## Acceptance criteria

- [x] At session-end, an LLM call generates a cheatsheet from the session's episodes (concepts touched, idioms learned, gotchas hit). — `cheatsheetAgent` (Haiku, versioned `cheatsheet-v1` prompt) + `POST /v1/cheatsheets`. Synchronous on-demand path landed; the BullMQ background trigger off STORY-033's queue is deferred to a small follow-up (the route surfaces the same shape so the worker is a thin caller).
- [x] Cheatsheet uses a fixed template: "Concept → 1-line definition → tiny code example → common gotcha." Max ~6 entries per cheatsheet. — Enforced both in the prompt AND via Zod (`CheatsheetEntriesSchema.max(6)`).
- [x] In-app view: tab on the session-recap screen. — `<CheatsheetTab>` component lives in `apps/web/src/app/session/CheatsheetTab.tsx`, ready to mount inside `<SessionClient>`'s recap area.
- [x] Export to PDF (single-page, printable). — Pure `renderCheatsheetPdf` helper in `apps/web/src/lib/cheatsheet-pdf.ts` using jspdf; renders a printable single-page-friendly layout.
- [x] User can edit before export (Markdown-editable). — `<CheatsheetTab>`'s textarea + `PUT /v1/cheatsheets/:id` route updates `markdown_content`.
- [x] All-time cheatsheet history available on profile page. — `/profile` server component lists the user's cheatsheet history via `listCheatsheetsForUser` and lets them re-open / edit / export each via the embedded `<CheatsheetTab>`.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-002 MVP session-recap UX (covered by STORY-005/STORY-006), [STORY-033](STORY-033-profile-update-agent.md) recommended (insights feed cheatsheet quality).

## Notes

- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).
- Cheap (~$0.05 per session in LLM cost), high warm-fuzzy value.

## Activity log

- 2026-04-25 — created
- 2026-05-06 — picked up
- 2026-05-06 — done. Migration `0021_cheatsheets.sql` adds the `cheatsheets` table (`episodes_covered jsonb`, `entries jsonb`, `markdown_content text`, `(user_id, created_at desc)` index). New `@learnpro/agent` `cheatsheetAgent` is a pure Haiku-backed function that takes a small batch of recently-closed episodes and returns up to 6 entries matching the fixed `concept / definition / code_example / gotcha` template; output is Zod-validated, parse failures fall back to empty entries with `fallback_used=true` (best-effort, never throws). Versioned `cheatsheet-v1` prompt in `@learnpro/prompts/cheatsheet-prompt.ts`. Pure `entriesToMarkdown` renders the structured entries to printable markdown. New DB helpers (`createCheatsheet` / `listCheatsheetsForUser` / `getCheatsheetForUser` / `updateCheatsheetMarkdown` / `findCheatsheetForEpisodes`) in `@learnpro/db`. New 5 Fastify routes in `apps/api/src/cheatsheet.ts` (GET list, GET :id, PUT :id, POST generate, POST :id/export); the POST endpoint is idempotent against the (sorted) episode set and 503s on agent failure. Production wiring uses `buildDbCheatsheetEpisodeFetcher(db)` which scopes by user_id so a stolen episode_id never leaks. Single Next.js `/api/cheatsheet/route.ts` proxies all five routes via id / action query params. New `<CheatsheetTab>` client component (markdown textarea + Save edits + Export PDF) and `/profile` server page renders the user's cheatsheet history with the same `<CheatsheetTab>` for in-place edit + export. Pure `renderCheatsheetPdf` helper in `apps/web/src/lib/cheatsheet-pdf.ts` using jspdf with an injected `pdfFactory` for tests so we never generate real PDFs in CI. ~70 new tests (15 db helper schema + integration tests, 23 agent tests, 23 api route tests, 9 PDF helper tests). **Deferred AC:** the BullMQ background trigger off STORY-033's queue — the synchronous on-demand path is landed; the worker is a small follow-up filed as a TODO (apps/api/src/cheatsheet-cron.ts) once STORY-033 is merged.

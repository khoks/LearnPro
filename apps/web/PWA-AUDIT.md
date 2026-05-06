# PWA pre-release audit checklist

> Lighthouse-style PWA verification for `apps/web`. Run this checklist locally **before each
> release to production** (or before tagging a release-candidate). The CI pipeline does **not**
> run a full Lighthouse pass — Chrome DevTools is heavy and slow, and the deterministic checks
> below cover the non-flaky parts of what Lighthouse audits anyway. Lighthouse scoring is the
> operator's responsibility on a one-off basis at release time.
>
> AC #7 of [STORY-044](../../project/stories/STORY-044-pwa-baseline.md) (`Lighthouse PWA audit
≥ 90`) is satisfied by ticking every box in this checklist.

---

## 1. Installability — manifest contract

Open the running app, then in Chrome DevTools → **Application → Manifest**:

- [ ] `name` is `LearnPro`.
- [ ] `short_name` is `LearnPro`.
- [ ] `start_url` is `/dashboard`.
- [ ] `display` is `standalone`.
- [ ] `theme_color` is `#0a7`.
- [ ] `background_color` is `#0a0a0a`.
- [ ] Both `192x192` and `512x512` icons load (no broken-image preview).
- [ ] At least one `purpose: "maskable"` icon is present (we ship one at 512x512).
- [ ] No "Errors and Warnings" pane entries under the manifest tab.

The same fields are also tested at SSR-time in `apps/web/src/app/layout.test.tsx`, so a
regression to the metadata shape will fail tests before this checklist runs.

---

## 2. Service worker

DevTools → **Application → Service Workers**:

- [ ] `/sw.js` is registered and shows status **activated and is running**.
- [ ] Source URL is the production-built JS (no inlined dev placeholder).
- [ ] No console errors during install or activate.

DevTools → **Application → Cache Storage**:

- [ ] A cache named `learnpro-shell-v1` exists.
- [ ] It contains, at minimum: `/`, `/dashboard`, `/onboarding`, `/recommended`, `/settings`,
      `/offline`, `/manifest.webmanifest`, `/icons/icon-192.svg`, `/icons/icon-512.svg`.
- [ ] No other (older `learnpro-shell-v*`) caches exist after a clean reload.

---

## 3. Offline behaviour

DevTools → **Network → Throttling → Offline**, then:

- [ ] Reload `/dashboard` — page renders from cache (no spinner of doom, no chrome offline page).
- [ ] Reload `/recommended` — same.
- [ ] Reload `/onboarding` — same.
- [ ] Navigate to `/session?track=python-fundamentals` — falls back to the `/offline` page (since
      `/session` is intentionally NOT in the precache; the editor can't run code offline).
- [ ] The `/offline` page shows the coach-voice "You're offline" message AND the list of cached
      pages the user can still visit.
- [ ] Toggle Network → Online: `/session` becomes reachable again.

Optional: with the **/playground** route open, toggle Offline. The `<OfflineBanner>` should
appear at the top with "The editor needs an internet connection to run code. Hints, history,
and your dashboard still work."

---

## 4. Install prompt

Pre-condition: log in as a user who has completed **at least 3** episodes with `final_outcome`
of `passed` or `passed_with_hints`. (Use the seed-bank harness or the e2e fixture from
[STORY-063](../../project/stories/STORY-063-e2e-mvp-loop-test.md).)

- [ ] On `/dashboard` the **Install LearnPro** card renders below the header.
- [ ] Clicking **Install LearnPro** triggers the system A2HS dialog.
- [ ] After install (or after clicking system "Cancel"), the card disappears.
- [ ] Reload `/dashboard` — the card stays hidden.
- [ ] In DevTools → Application → Local Storage, the key
      `learnpro:install-prompt-dismissed-at` holds an ISO timestamp.

Pre-condition (negative): with a **fresh user** (zero episodes):

- [ ] On `/dashboard` the install card does **not** render.
- [ ] `GET /api/dashboard/install-eligible` returns `{ eligible: false, successful_episodes: 0 }`.

---

## 5. Lighthouse smoke (final score gate)

Chrome DevTools → **Lighthouse → Categories → Progressive Web App** (uncheck the others to
keep the run fast). Run on `/dashboard` over a fresh incognito window:

- [ ] Lighthouse PWA **score ≥ 90** (the AC #7 bar).
- [ ] All "Installable" rules pass.
- [ ] The "PWA Optimized" group has no failing rule that we can fix in code (some rules around
      maskable icons / splash-screen sizes only flag warnings on SVG icons; flagged-as-warn is
      acceptable for the baseline. Track real issues here.).

If the score is < 90, file a Story under EPIC-013 documenting the regression and link this
checklist's run.

---

## 6. STORY-023 push handler must keep working

The service worker carries TWO responsibilities. After everything above, make sure we didn't
break the bell-icon flow:

- [ ] DevTools → **Application → Push** → Send a test push payload.
      `{"title":"Hello","body":"From the audit","url":"/dashboard"}`.
- [ ] System notification appears.
- [ ] Clicking the notification opens / focuses the LearnPro tab on `/dashboard`.

---

## Reference

- The pure decision logic backing the `fetch` strategy lives at
  `apps/web/src/lib/sw-handlers.ts` — exhaustively unit-tested. The service worker
  `apps/web/public/sw.js` mirrors the same constants.
- The cache-version namespace is `learnpro-shell-v1`. Bump to `v2`, `v3`, … when the precache
  list or strategy table changes; the activate handler will sweep the old cache.
- The install-prompt eligibility threshold is `3` successful episodes (constant
  `INSTALL_PROMPT_THRESHOLD` in `apps/api/src/install-eligible.ts`).

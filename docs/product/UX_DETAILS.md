# LearnPro UX Details

> **Purpose.** This is the per-epic UX deep-dive that locks the look, feel, and *pedagogy* of LearnPro. It is the source of truth for "what does the product actually feel like to use" — referenced from each MVP epic file.
>
> **How to use.** When you build a Story under any MVP epic, find the matching section here first. The flows, alternatives, edge cases, and (for the tutor) the pedagogy patterns documented below are decisions, not suggestions.
>
> **Why this exists.** Phase B ([`COMPETITIVE.md`](./COMPETITIVE.md), [`DIFFERENTIATORS.md`](./DIFFERENTIATORS.md)) locked *what makes LearnPro worth using*. This doc translates that into specific UI choices and behaviors. Every design decision here either reinforces a differentiator or has been explicitly traded off against one.
>
> **What's not here.** Pixel-perfect mocks, copy decks, color tokens. Those are downstream of the locked behavior. Only after the loop ships will it be worth a real designer's time to push the surfaces.

---

## Table of contents

- [The first-session magic moment (cross-cutting)](#the-first-session-magic-moment-cross-cutting)
- [EPIC-002 — MVP adaptive loop](#epic-002--mvp-adaptive-loop)
- [EPIC-003 — Containerized code sandbox](#epic-003--containerized-code-sandbox)
- [EPIC-004 — Tutor agent harness (the pedagogy)](#epic-004--tutor-agent-harness-the-pedagogy)
- [EPIC-005 — Learner profile & episodic memory](#epic-005--learner-profile--episodic-memory)
- [EPIC-006 — Multi-horizon planning](#epic-006--multi-horizon-planning)
- [EPIC-007 — Adaptive problem generation & grading](#epic-007--adaptive-problem-generation--grading)
- [EPIC-009 — Learning tracks](#epic-009--learning-tracks)
- [EPIC-010 — Career-aware curriculum](#epic-010--career-aware-curriculum)
- [EPIC-011 — Gamification](#epic-011--gamification)
- [EPIC-012 — Notifications](#epic-012--notifications)
- [EPIC-013 — Cross-platform (responsive web baseline)](#epic-013--cross-platform-responsive-web-baseline)
- [EPIC-015 — SaaS readiness primitives](#epic-015--saas-readiness-primitives)
- [EPIC-016 — Security & anti-cheat](#epic-016--security--anti-cheat)
- [Cross-cutting: edge cases & error states](#cross-cutting-edge-cases--error-states)
- [Cross-cutting: copy & tone](#cross-cutting-copy--tone)

---

## The first-session magic moment (cross-cutting)

**The bet.** A new user must reach a moment of *"oh, this thing actually understood me and made me think"* within **8 minutes** of landing on the homepage. If that doesn't happen, they leave and don't come back. This is the single most important UX in the product.

### Target flow with timing budgets

| Step | Budget | What user sees | What system does |
|---|---|---|---|
| 1. Landing → sign up | 60s | One-screen marketing pitch ("Your AI tutor for serious coding practice. Self-hosted. It actually adapts."), one CTA: **Start a session**. GitHub OAuth or email magic link. | Auth.js issues session, creates `user_id`+`org_id` row. |
| 2. Onboarding (5 Qs) | 90s | Single-page form, no progress nag, visible "Skip" on each (defaults are good): (1) target role, (2) languages you already know, (3) languages you want to learn, (4) daily time budget (15/30/60 min), (5) current level (new / can build small things / employed engineer). | Persists to learner profile; chooses default track. |
| 3. Track confirmation | 15s | "Based on your answers we recommend **Python fundamentals** — 30 min/day. Change track" link below. Single big button: **Start your first session**. | Tutor agent pre-warms; session-plan agent generates micro-objectives. |
| 4. Session plan reveal | 10s | Sidebar shows "Today's session: 3 things — (1) understand list comprehensions, (2) apply on a real problem, (3) reflect." Friendly, scannable. Main panel: editor + first problem statement. | Session record opened. |
| 5. First problem | 4–5 min | Problem at calibrated easy level (e.g. "given a list of numbers, return the squares of the even ones — use a list comprehension"). Editor pre-populated with a function signature and a single failing test visible. Big **Run** button. | Sandbox warm; tutor watching for paste / long pause. |
| 6. First grade & feedback | 30s | Tests pass → green checkmark → tutor says one short thing, specific to *what they wrote* (not generic): "Nice — your `[x*x for x in nums if x % 2 == 0]` is the idiomatic form. Want to see how this would look without a comprehension, for contrast?" Two buttons: **Yes, show me** / **Next problem**. | Profile updated; next problem queued. |

**Total budget: ≤ 8 minutes from sign-up click to first green checkmark.**

### Why this specific shape

- **One CTA, no marketing carousel.** This audience hates being sold to. The product *is* the pitch.
- **Onboarding is 5 questions, all skippable.** Every question we add costs ~10% of completion. Skippable defaults preserve the path.
- **Pre-populated function signature and one visible failing test.** Removes "what do I even type" friction. The test is the spec — the user reads it, codes to it, runs it. This mirrors how real engineers work and is what they'll spend most of their LearnPro time doing, so we should teach them the loop on day one.
- **First problem is *easy* on purpose.** First-session goal is "feel the loop," not "be challenged." Real adaptiveness kicks in problem 2.
- **Tutor's first message references *their actual code*, not a canned response.** This is the moment they see "this thing is paying attention." If we get this wrong, we're a worse Codecademy.
- **Two buttons after the first solve, not one.** Choice = agency = engagement. The "show me without a comprehension" path is bait — it teaches a *contrast*, which is high-leverage pedagogy and signals depth.

### Failure modes to avoid

| Failure | What it looks like | Counter |
|---|---|---|
| Onboarding drop-off | User abandons on Q3. | All 5 questions skippable; defaults are sensible; show count "3 of 5" only as muted text, not a progress bar (which feels like work). |
| Empty editor → blank-page paralysis | User stares at empty Monaco for 90s before typing. | Pre-populate function signature + one comment line: `# write your code here`. Cursor lands inside the function body. |
| First problem too hard | User struggles 10+ min on problem 1, never comes back. | Problem 1 is fixed (not adaptive) and is calibrated to ~3 min for someone in the lowest-self-reported level. Adaptiveness starts problem 2. |
| Generic tutor first response | "Great job! Let's continue." → user thinks "this is just ChatGPT." | Tutor MUST quote a token from their actual submission in the first response. Enforced by prompt + post-processing check. |
| First-session sandbox cold-start | "Run" button takes 12s the first time. | Pre-warm a Python container during onboarding (steps 1–4 above). User never feels the cold start. |

### Alternatives considered

| Alternative | Why we rejected |
|---|---|
| **Skill-test pre-quiz before any coding** | Boot.dev does this. It's accurate but boring and feels like school. We get most of the same calibration signal from problem 2 onward via the difficulty tuner, without a 5-min quiz on day one. |
| **Tutor-led guided tour ("Hi! I'm your tutor, click here to…")** | This is what bad onboarding looks like. The tutor should *appear* when the user has done something, not narrate. |
| **Offer a track choice up front (Python, TS, "I don't know")** | Adds a decision before any signal. Better: infer from onboarding answers and offer "change track" as a tiny secondary action. |
| **Show difficulty/XP HUD from problem 1** | Premature. On problem 1 the user doesn't yet know the loop; HUD is noise. Reveal XP after the first solve as a celebration. Streak counter appears on day 2. |

---

## EPIC-002 — MVP adaptive loop

Owns: dashboard, session start, in-session UX, end-of-session UX, the orchestration that ties EPIC-003/004/005/007 together.

### Dashboard (post-onboarding home)

**Anatomy.**
- **Top bar:** logo, username, streak counter (after day 2), XP total, day-so-far time progress (small bar: "12 min / 30 min today").
- **Main column:** ONE big card — "Continue your session" (if mid-session) OR "Start today's session" (if not started today) OR "You're done for today — see you tomorrow" (if done).
- **Secondary column** (right, collapses on narrow viewport): mastered concepts list, current track progress bar, link to "all tracks."
- **No feed, no leaderboard, no recommended-content carousel.** Resist.

**Why one big card.** This is *the* CTA. Engineering aesthetic — get to work fast. Every additional card on this page is a chance for the user to bounce out into a content browse instead of practicing.

### Session start

User clicks "Start today's session." Sequence:

1. Brief loading state (≤ 1.5s) while session-plan agent generates 3–5 micro-objectives.
2. Plan reveal: sidebar shows the objectives as a checklist. **Main panel: first problem already loaded with editor.** No separate "review your plan" screen — the plan IS the sidebar, the work IS the editor.
3. Pre-warm sandbox in the background (problems are ordered, so the next runner is already starting before user hits Run on the current).

### In-session main surface (the editor page)

**Layout (desktop, ≥ 1280px wide):**

```
┌────────────────────┬───────────────────────────────────────────────┬───────────────┐
│ SIDEBAR            │ EDITOR (Monaco)                               │ TUTOR PANEL   │
│                    │                                               │               │
│ Session plan       │ # solve.py                                    │ [tutor msg]   │
│  ✓ List comprehs   │ def squares_of_evens(nums):                   │               │
│  ◉ Apply on prob   │     # write your code here                    │ [hint button] │
│  ○ Reflect         │     pass                                      │ [stuck btn]   │
│                    │                                               │               │
│ Problem statement  │                                               │               │
│ "Given a list…"    │                                               │               │
│                    ├───────────────────────────────────────────────┤               │
│ Hidden tests: 4    │ RESULT PANEL                                  │               │
│ Visible tests: 1   │ ▶ test_basic         PASS                     │               │
│ Time on problem:   │ ▶ test_empty         FAIL  expected [], got…  │               │
│  1m 24s            │ stdout / stderr / your prints                 │               │
│                    │                                               │               │
│ [Run]  [Submit]    │                                               │               │
└────────────────────┴───────────────────────────────────────────────┴───────────────┘
```

**Layout (narrow / tablet, 768–1279px):** sidebar collapses to a top strip; tutor panel becomes a bottom drawer that slides up on hint/grade events.

**Layout (mobile, < 768px):** out of MVP scope — see EPIC-013. We render a "use a wider screen for the editor" message; everything else (dashboard, profile) is mobile-OK.

### Run vs. Submit (a deliberate split)

| Button | Behavior | When to use |
|---|---|---|
| **Run** | Executes against *visible* tests + user's `stdin`/prints. **Free** (no XP cost, no submission counted). Fast feedback loop. | Iterating on your code. |
| **Submit** | Executes against visible *and* hidden tests. Counts as an attempt for grading + difficulty tuner. **Triggers tutor grade** + profile update. | When you think you're done. |

**Why split them.** The "every keystroke runs tests" pattern (Codewars-style) trains learned helplessness — students copy/paste, hit run, watch errors, change something, repeat without thinking. Splitting Run from Submit forces a small "am I actually done?" moment. This is the LearnPro pedagogy pulled into the UI.

**Alternatives considered:**

| Alternative | Why rejected |
|---|---|
| **Single button (Run = Submit)** | Reverts to the every-keystroke spam loop we're trying to avoid. |
| **Submit always shows hidden tests if you fail** | Gives away spec — defeats the purpose of hidden tests as a "did you think about edge cases?" check. We instead say *which* hidden test failed (e.g. "test_empty_input") without revealing the input. |
| **No Run at all, only Submit** | Too friction-heavy for early-stage problems. Run is necessary for working through ideas. |

### End-of-session UX

When the session-plan checklist is complete (or user clicks "End session"):

- **Recap card:** "You spent 28 min, solved 4 problems, used 2 hints. Today you got better at: list comprehensions, slicing." (Concept names come from profile updates.)
- **Streak / XP fanfare:** subtle, not obnoxious. A small +XP flyer. Streak counter increments. **No confetti.** No "YOU'RE ON FIRE 🔥" copy.
- **Tomorrow's promise:** "Tomorrow we'll look at dictionary comprehensions and lambdas — building on today." (One sentence, generated by session-plan agent for the *next* day's preview.)
- **One CTA:** "Done — see you tomorrow." (No upsell, no "share your progress," no "rate the lesson.")

### Edge cases

| Case | Behavior |
|---|---|
| User reloads mid-session | Resume to exact state: same problem, same code in editor (autosaved every 3s), same hint progress. |
| User opens 2 tabs | Last tab to autosave wins; show non-blocking toast in other tab: "Edited in another tab — refresh to sync." |
| User goes idle 20+ min mid-problem | Pause time-on-problem counter. On return: "Welcome back — picking up where you left off." (No "are you still there?" modal — feels patronizing.) |
| User abandons mid-problem and comes back tomorrow | Session is closed automatically at end of day. Yesterday's incomplete problem becomes a "would you like to retry this?" suggestion in tomorrow's session. |
| User exceeds daily token budget mid-session | Tutor panel shows: "You've used today's AI tutor budget. The grader still works — you can keep solving. Tutor returns at midnight." Loop degrades gracefully to "tests + automated correctness signal" only. |

### Design notes specific to EPIC-002

- **One single source of truth on the page is the test result panel.** If tests pass, user solved it. The tutor is *commentary*, not arbiter. (Architectural decision: see EPIC-007 grading-by-tests-with-LLM-commentary section.)
- **Autosave every 3s.** Lose-no-work guarantee.
- **Keyboard shortcuts** from day 1: `Ctrl+Enter` runs, `Ctrl+Shift+Enter` submits, `Ctrl+/` toggles tutor panel, `Ctrl+H` requests next-rung hint. Visible in the right-side tutor panel as a tiny `?` shortcuts overlay.

---

## EPIC-003 — Containerized code sandbox

Owns: the container that runs user code, the streaming protocol, the result panel rendering.

### User-facing UX

The user sees: editor → click Run → result panel populates within ~1.5s for a typical problem. That's it. Everything else is invisible to them — and that's the goal.

**Visible elements:**
- **Run / Submit buttons** (covered above in EPIC-002).
- **Result panel** with three tabs: `Tests`, `Output`, `Errors`.
  - `Tests`: per-test pass/fail with assertion message, expected vs. actual, expandable.
  - `Output`: stdout from the user's prints, line-by-line as they stream.
  - `Errors`: stderr + traceback, with the user's filename highlighted.
- **Status indicator** (top-right of result panel): green pulse when running, gray dot when idle, red X when sandbox crashed.

### Streaming behavior

stdout streams *live* (line-by-line via WebSocket) — not batched at end. This is critical for two reasons:

1. **Long-running problems** (e.g. "compute the Nth prime") give the user a sense of progress.
2. **Pedagogically** — they see their `print` debug statements appear as the program runs, which is how they'll debug in real life. This is our differentiator over Codewars-style "submit and wait" UX.

### Edge cases

| Case | Behavior |
|---|---|
| Code runs > 10s wall clock | SIGTERM at 10s, SIGKILL at 12s. Result panel shows: "Timed out at 10s. Your code may have an infinite loop or be too slow for the input size." |
| Code uses > 256MB memory | OOMkilled. Show: "Out of memory. Are you building a list bigger than necessary?" |
| Code attempts network call | Connection refused (no network). Show: "Network access is disabled. Sandboxes are isolated for safety." Don't lecture. |
| Code prints > 1MB | Truncate at 1MB, show: "Output truncated at 1MB. (Try printing only what you need.)" |
| Sandbox host is overloaded → queue | Show: "Queued (12s estimated)" — no one likes silence. |
| Sandbox crashes (host issue, not user code) | Show: "Sandbox unavailable — retrying." Auto-retry once, then fall back to "Sandbox is down. Your work is saved. We're investigating." Telemetry alert fires. |
| Piston hits its own internal limits | Show same generic crash message. Log details server-side. |

### Pool-vs-one-shot decision (architectural, surfaced in UX)

For MVP, every Run spins up a fresh Piston container (one-shot model). Pros: max isolation, simple. Cons: ~500ms cold start.

For v1, we'll add a warm pool of long-lived containers per-language for stateful workspaces (multi-file projects, REPL mode). MVP doesn't need this — keep it simple.

**Why this matters in UX:** the ~500ms cold-start is the budget for the "running" pulse animation. If we drop below 300ms, animation feels jumpy. Tune accordingly.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Run code in WASM in the browser (Pyodide, etc.)** | Avoids a backend entirely. But: no network isolation matters anyway, and WASM is missing many stdlib pieces (`subprocess`, file I/O patterns, etc.). More importantly: it can't run TypeScript with a real Node runtime. We'd diverge from the v1 multi-language plan. |
| **Run code in a serverless function (Lambda, Cloud Run)** | Cold start is worse, costs grow per-execution, and we lose control of the seccomp/cgroups profile. Also breaks the self-host story. |
| **One persistent container per user** | Higher memory footprint, harder to enforce per-execution budgets, and stale-state bugs are common. Defer to v1 stateful-workspaces feature with explicit lifecycle. |

---

## EPIC-004 — Tutor agent harness (the pedagogy)

This section is the most important in the document. The tutor *is* the product differentiator. Every choice below has a reason.

### Tutor identity (system-prompt level)

- **Persona:** A patient, slightly nerdy senior engineer who's been mentoring you for a while. Knows your background. Doesn't pretend to know things they don't.
- **Tone register:** Direct + warm. Uses contractions. Avoids exclamation marks. Avoids emoji entirely. Will joke occasionally if a user joke lands; never starts the joking.
- **What it never does:** Praises empty effort ("great try!"). Apologizes for being an AI. Refers to itself in 3rd person. Says "I'm just a language model." Uses motivational copy ("you got this!"). Pretends to remember something it doesn't (forces a profile lookup instead).
- **What it always does:** References the user's actual code, not generic advice. Answers the question first, then expands. Admits uncertainty when grading subjective things.

### The question-vs-reveal heuristic (the core pedagogy)

When a user asks a question or hits Submit with wrong code, the tutor must decide: do I ask a Socratic question to guide them, or do I reveal the answer?

**Default: question first, reveal on second ask.** Specifically:

| Signal | Tutor behavior |
|---|---|
| First time stuck on this problem | Socratic question that targets the *concept gap* — e.g. "What's the type of `nums[0]` here, and is that what you want to iterate over?" |
| Second time on the same gap (asked again, or hint button pressed twice) | Partial reveal — show a code snippet illustrating the concept on a smaller example, not on the user's exact problem. |
| Third time on the same gap (hint rung 3) | Full reveal of the *technique*, not the answer. E.g. "You need to use a list comprehension here — `[expression for x in iterable if condition]`. Try applying that pattern." |
| User explicitly types "just give me the answer" or clicks "Reveal solution" (which exists but costs a lot of XP) | Full solution + a one-line "here's why this works" — tagged as `reveal` in profile so we don't double-count this concept as mastered. |
| User submits correct + idiomatic code | Tutor confirms with one specific note ("nice use of `enumerate`"), suggests one extension or contrast ("here's how it'd look with a `for` loop, for comparison — same time, more lines"), then queues next problem. |
| User submits correct but inefficient code (passes tests, O(n²) when O(n) exists) | Tutor confirms it works, then asks: "It passes — but if `nums` had a million elements, what would happen? Look at the inner loop." Doesn't fail them; nudges them. |
| User submits correct but non-idiomatic code | Tutor confirms, then shows the idiomatic version side-by-side with one sentence on why. |
| User submits something with a syntax error | Tutor doesn't comment on style. Shows the error from the result panel and asks one targeted question: "Look at line 4 — what's missing after the colon?" |

### Tone calibration table (specific scripts)

| Situation | Bad tutor (AVOID) | Good tutor (DO) |
|---|---|---|
| User solves easy problem | "🎉 Amazing job! You're a coding superstar!" | "Yep — and `[x*x for x in nums if x % 2 == 0]` is the form most Python devs would write. Next." |
| User stuck for 5 min | "Don't give up! You can do it!" | "Stuck? What does `nums` look like at the top of your loop? Add a `print(nums)` and run it." |
| User submits wrong 3 times | "Let me give you a hint!" (unprompted) | (silence — wait for the user to ask, or let the difficulty tuner ease the next problem; do not surprise-hint) |
| User asks "is this a good solution?" | "Yes, this is a good solution!" | "It's correct. It runs in O(n²) because of the nested loop on line 6 — there's an O(n) version using a set. Want to see the contrast, or move on?" |
| User asks something off-topic ("what's a good IDE?") | Refuses to answer ("I'm here to help with coding…") | Answers briefly and pivots ("VS Code is the standard for most Python work. Want to keep going on the problem, or are you done for today?") |
| User says "this is too easy" | "Great, we'll make it harder!" (and ramps wildly) | "Noted — bumping difficulty. If the next one feels off, tell me again." |
| User says "this is too hard / I'm dumb" | Empty reassurance ("you're not dumb!") | "This concept trips up most people the first time — it's not intuitive. Let's drop back one notch and rebuild." (Then actually drops difficulty.) |
| User makes a typo and laughs about it | (no humor / over-formal) | Acknowledges briefly: "Happens — fix the typo and re-run." |
| User clearly cheating (paste of full solution + zero edits + submit) | Accuses: "It looks like you copy-pasted." | Doesn't accuse. Logs `paste_ratio` in episode. Tutor responds with: "Walk me through line 6 — why does it use `defaultdict` here?" If user can't, profile records lower confidence on the underlying concept. |

### Frustration handling

Inputs we use to detect frustration (heuristic, not ML):

- ≥ 3 failed submits in a row on same problem
- Time on problem > 2× expected for difficulty
- Hint rung 3 reached without solve
- User types into the tutor panel a message > 100 chars (long messages correlate with venting)

When triggered, tutor switches mode:

- **Acknowledges, doesn't reassure.** "This one's been a slog — let's pause."
- **Offers explicit choices:** "(a) easier problem to rebuild momentum, (b) full walkthrough of this one and we move on, (c) skip and come back tomorrow."
- **Never auto-switches** without asking. User agency is the point.

### Cheating detection (philosophy)

LearnPro does not police cheating. The profile is the user's own; if they sabotage it, they sabotage themselves. **But**: profile accuracy matters because adaptiveness depends on it. So:

- **Soft signals only** in MVP: `paste_ratio` (chars pasted vs. chars typed in this problem), `time_on_problem`, `hint_rungs_used`. Logged silently.
- **No accusations.** Never. The tutor never says "did you copy this?"
- **"I got help on this one" toggle** in the result panel: optional, off by default. If on, the submission is graded but **does not count toward concept mastery**. This is a feature for honest learners — they get the grade and the satisfaction without polluting their adaptiveness.
- **v1+ adds:** keystroke entropy, full-paste detection with confirm modal, and an honesty mode that locks paste during practice problems (opt-in).

### What the tutor explicitly does NOT do

- **Doesn't write code on the user's behalf** unless the user explicitly clicks "Reveal solution."
- **Doesn't autocomplete in the editor.** Monaco's built-in IntelliSense is on (it's lightweight syntax assist), but no Copilot-style ghost-text. This is a **deliberate anti-Copilot stance** — see [`DIFFERENTIATORS.md`](./DIFFERENTIATORS.md) §5.
- **Doesn't volunteer hints.** User must ask. Reduces learned helplessness.
- **Doesn't praise effort.** Praises specific things in specific code.
- **Doesn't reference its own internals.** No "as a language model," no "let me search my memory," no token / cost references.

### Tutor panel UX

- **Always present**, right-hand side, ~360px wide.
- Top: a thin header with the tutor's "current state" — neutral / typing / waiting for run.
- Body: a chat-style scroll, latest message at bottom, but **with a hard 4-message visible cap before "expand history."** Long scrollback distracts from the editor.
- Bottom input box: free-text with placeholder "ask a question…". `Enter` sends; `Shift+Enter` newlines.
- Two pill buttons above the input: **`Hint`** (next rung; cost shown — "5 XP", "15 XP", "30 XP") and **`I'm stuck`** (offers the choice menu from the frustration section).
- A muted "tutor is typing…" indicator while streaming.

### Edge cases (tutor)

| Case | Behavior |
|---|---|
| LLM rate-limited or 5xx | Tutor panel shows: "Tutor reconnecting…" with a 5s retry. After 3 retries, fallback to "Tutor offline — tests still grade. Try again in a minute." Code-run loop unaffected. |
| LLM returns a blocked / refusal response | Log; show generic "Couldn't generate a response — try rephrasing." Don't expose provider internals. |
| User asks for harmful content (out of scope, but ChatGPT-style users will try) | Polite redirect: "Not what I'm here for — let's get back to the problem." No moralizing. |
| User asks about a concept not in their current track | Answers briefly + offers: "We can fold this into your plan — want me to add a quick session on it?" If yes, session-plan agent updates plan. |
| Token budget exhausted mid-response | Stream what's been generated so far, then append: "Hit your daily AI budget — back tomorrow. Tests still work." |
| Very long user message (> 2000 chars) | Trim politely: "Long message — I'll respond to the first part." (Prevents prompt-injection by dump.) |

### Provider abstraction surface in UX

Users never see "powered by Anthropic" or any model name. The tutor is the tutor. (Self-hosters can configure provider in settings — see EPIC-015. End users never need to know.)

### Why this pedagogy is the differentiator

Every other AI-assisted tool today optimizes for speed-to-completion (Copilot, Cursor, Replit Ghostwriter). LearnPro optimizes for *learning gain per minute spent*. That requires:

1. **Asking questions before answering** — Socratic-first is the highest-evidence teaching technique.
2. **Refusing to autocomplete** — autocomplete steals the productive struggle.
3. **Specific feedback** — generic praise teaches nothing; specific feedback on real code teaches the rule.
4. **No surprise help** — surprise hints break the productive struggle. User must request.
5. **Adaptive without being patronizing** — drops difficulty silently, doesn't say "this seems hard for you."

These are the rules. Violating any of them collapses LearnPro into "ChatGPT with extra steps."

---

## EPIC-005 — Learner profile & episodic memory

Owns: the schema and the user-visible "what does the system know about me" surface.

### What's stored (schema, conceptually)

- **Per-concept skill score** (0–1) with **confidence** (0–1, increases with repeated evidence). E.g. `python.list_comprehensions: 0.62 (conf 0.8)`.
- **Per-concept last-touched timestamp** (drives spaced repetition in v1).
- **Episodes** — per-problem records: timestamp, problem id, time-on-problem, attempts, hint rungs used, final correctness, paste ratio, idiomatic-ness score (LLM-rated 1–5), tutor's one-line summary of what happened. Embedded as a vector for v1 RAG.
- **Track-level progress** — concepts mastered / in-progress / not-yet.

### User-facing "Profile" page

A read-only page (in MVP — editing comes in v1). Shows:

- **Skill heatmap** — concepts on Y axis (grouped: "Python: control flow," "Python: collections," etc.), color = skill score, dot opacity = confidence. Hover for raw numbers.
- **Recent episodes** — last 10 problems with the tutor's one-line summary. Clickable → opens the original problem with the user's submitted code.
- **Mastery list** — concepts with `skill ≥ 0.8 AND confidence ≥ 0.7`. Visible badge.
- **Data export button** — JSON dump (covered in EPIC-002 / GDPR baseline).

### What's NOT shown to the user in MVP

- **The raw episodic vectors.** Implementation detail.
- **The exact difficulty-tuner formula.** Surfacing this lets users game it.
- **"Confidence" as a number** (we show it as dot opacity instead). Numbers invite dispute.

### Mastery definition (the actual rule)

A concept is "mastered" when:

- Skill score ≥ 0.8 (out of 1.0)
- Confidence ≥ 0.7 (i.e., we have at least ~5 corroborating episodes, not lucky one-off)
- Most recent successful application was within the last 14 days (otherwise it's "fading" and queued for review)

This is the heuristic for MVP. In v1, we replace it with FSRS for review scheduling.

### Why we don't show every signal to the user

Two reasons:

1. **Anti-gaming.** If we show "you need 3 more correct submits to master `list_comprehensions`," users will grind for the badge instead of the skill. The whole point of the profile is *truthful adaptive signal*.
2. **Cognitive load.** Most users don't want to manage their own learner profile. They want to do today's session and trust the system. Power-users get the heatmap; everyone else can ignore it.

### Edge cases

| Case | Behavior |
|---|---|
| User asks "why am I bad at X?" | Tutor pulls last 3 episodes touching X, summarizes: "You've solved 3/5 problems on X, the 2 you missed both involved nested iteration. Want a problem on that?" |
| User retakes a problem they already mastered | Counts toward "review" not "new evidence." Doesn't bump skill score above current. (Otherwise grinding old problems inflates skill.) |
| User explicitly resets a concept | (v1 feature) Confirm modal, then sets skill back to 0 with reason logged. |
| Profile gets out of sync (rare LLM grading bug) | Tutor flags it with `update-profile` correction in a later episode. Add a `manual-override` flag to v1 admin tools. |

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Single composite "level" score (1–100)** | Easy to display, but completely useless for adaptive selection — a user at "level 47" might be 90% on iteration and 10% on recursion. Need per-concept granularity. |
| **Show full skill graph from day 1** | Premature — the graph is empty/noisy for the first ~5 sessions. Show a friendly "we're still learning about you" placeholder until ≥ 10 episodes. |
| **Let user set their own skill levels** | Defeats the point. Self-rating is famously inaccurate (Dunning-Kruger). The whole bet of LearnPro is the system measures them more accurately than they measure themselves. |

---

## EPIC-006 — Multi-horizon planning

Owns: the session-plan agent and its UI surface.

### Session plan (MVP scope)

Generated at session start. 3–5 micro-objectives. Each is concrete:

- **Bad** (avoid): "Get better at Python."
- **Bad**: "Practice for 30 minutes."
- **Good**: "Apply list comprehensions to a real filtering problem."
- **Good**: "Solve 2 problems involving dict-of-lists patterns."

The plan is generated by the session-plan agent based on:

1. **Yesterday's episodes** — what concepts are at-risk of decay?
2. **Current track position** — what's the next concept in sequence?
3. **Time budget** — how many objectives fit in the configured daily minutes?

### UX

- **Sidebar checklist** during session (see EPIC-002 layout). Checked off automatically when an objective's exit condition is met (e.g., "solve 2 problems on dict-of-lists" → 2 problems passed).
- **End-of-session recap** references which objectives were achieved.
- **No "edit plan" button in MVP.** The plan is the system's recommendation. If user wants to override, they tell the tutor ("I want to do something different today") and the tutor asks the session-plan agent to regenerate.

### Day / week / mastery horizons

**Deferred to v1.** MVP only does session-level planning. Day plan is implicit ("you've used 12/30 min today"). Week plan is implicit (the system picks objectives that move toward next-concept-in-track).

**Why defer.** Multi-horizon planning is hard to validate without first having a working session loop. We'd risk over-planning a learner who isn't even retaining session 1. Build the session, ship it, then add longer horizons in v1.

### Soft budgets, not hard cuts

When the user reaches their daily time budget mid-problem:

- **Soft prompt** appears in tutor panel: "You've hit your 30-min budget. Finish this problem and call it a day, or keep going — your call."
- **No auto-stop.** Patronizing. User decides.
- **Streak credit** is granted at first solve, regardless of total time. So users hit streak quickly and aren't tempted to grind out a meaningless extra 10 min just to "not break the streak."

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **AI-only generated plan with no exit conditions** | Can't auto-check off → user has to manually mark done → friction. |
| **Show the day/week/mastery plan in MVP** | Premature; no user has data to plan against in their first week. |
| **Hard cut at time budget** | Punishes users who are in flow. Anti-pattern. |

### Edge cases

| Case | Behavior |
|---|---|
| Plan generation fails (LLM down) | Fall back to "next concept in track sequence" + "1 problem from yesterday's weak area." Static, but works. |
| User finishes plan in < daily budget | Offer: "You crushed today's plan in 18 min — want a bonus problem, or save it for tomorrow?" Both are fine answers. |
| User misses days | Re-balance plan to prioritize fading concepts on return. Don't shame ("welcome back" — don't say "you missed 3 days"). |

---

## EPIC-007 — Adaptive problem generation & grading

Owns: the curated problem bank, the hint ladder, the grader, the difficulty tuner.

### Problem bank (MVP)

- **Curated, not LLM-generated.** ~30 problems per language. Hand-written by us. Each has: statement, function signature, visible test(s), hidden tests, target concept(s), difficulty (1–5), idiomatic reference solution.
- **Stored as markdown + JSON in the repo** (`packages/problems/`). Versioned. Review-able by PR.

**Why curated.** LLM-generated problems are hit-or-miss in quality, often have ambiguous specs, and have a "this feels off" vibe even when correct. For MVP we eat the cost of writing them by hand. v1 adds LLM-generated *variants* of curated problems (e.g., same shape, different domain words) — bank stays curated, variants augment.

### The 3-rung hint ladder

When user clicks **`Hint`** in the tutor panel:

| Rung | Content | XP cost |
|---|---|---|
| 1 | A *Socratic question* that targets the gap. ("What's the type of `nums[0]`?") | 5 XP |
| 2 | A *partial reveal* — analogous example on a smaller problem. ("Here's a list comprehension on a tiny example: `[x+1 for x in [1,2,3]]` returns `[2,3,4]`. Now apply that pattern.") | 15 XP |
| 3 | A *technique reveal* — name the technique and show the pattern, but not the answer. ("You need a list comprehension with a filter clause: `[expr for x in iterable if cond]`. Apply it to your function.") | 30 XP |

After rung 3, the only path forward is "I'm stuck" → frustration handler choices (see EPIC-004).

**Why XP cost.** Hints are valuable and scarce, not free. Cost trains the user to think before clicking. Without cost, users click hint reflexively and learn nothing.

**Why 3 rungs, not 5 or 10.** 3 is enough to walk from question to reveal. More rungs = decision paralysis.

### Grading architecture

The grader is **not** the LLM. It's a deterministic test runner. The LLM provides *commentary* on top.

```
[user submits code]
        ↓
[run tests in sandbox] ──────→ correctness: PASS or FAIL (binary, deterministic)
        ↓
[tutor LLM reads code + test result + concept] ──→ commentary on:
                                                    - idiomatic-ness (1–5)
                                                    - efficiency (1–5)
                                                    - one specific note
        ↓
[profile updates] ← commentary informs skill score nudge
```

**Why this split.** LLM grading alone is unreliable (it occasionally hallucinates a pass on broken code, or flunks correct-but-unusual code). Tests are the floor — if tests fail, code fails, period. LLM is the ceiling — it tells the user *why* the code is good or bad even when it's correct.

### Difficulty tuner (heuristic, MVP)

After each problem, compute a per-concept score adjustment:

```
delta_skill = +base × correctness_multiplier
            - 0.1 × hint_rungs_used
            - 0.05 × overtime_factor   (if time > 2× expected)
            - 0.05 × failed_attempts
```

(The actual coefficients live in code and will be tuned with real data.)

For *next problem selection*:

- Pick from the same concept if `skill < 0.5`.
- Move to next-concept-in-track if `skill ≥ 0.7 and confidence ≥ 0.5`.
- Mix in one review problem from a fading concept every 3rd problem.

**This is intentionally simple.** In v1, we replace this heuristic with a learned model (logistic regression on episode features → predicted skill gain). MVP heuristic is good enough to validate the loop.

### Tests-as-floor, LLM-as-commentary (UX implications)

- Grade is **revealed instantly** when tests finish (~1.5s). Don't wait for LLM.
- Tutor commentary streams in **after** the green/red verdict. Latency-tolerant.
- Visible tests show their input/output so user can debug. Hidden tests show only their *name* and pass/fail.
- If a hidden test fails, the message is "test_empty_input failed" — *not* "your code crashes on []." We name the test deliberately so the user can intuit.

### Edge cases

| Case | Behavior |
|---|---|
| All tests pass but LLM grader rates code 1/5 idiomatic | Show: green check + tutor note "Works! But here's a cleaner way…" Profile bumps skill, but slower than for idiomatic solve. |
| User passes by accident on a test that doesn't really exercise the concept | Curated tests should cover the concept; if not, that's our bug. v1 adds a "did this problem actually test the concept?" telemetry signal. |
| Difficulty tuner ramps too fast (problem 3 is impossibly hard) | "I'm stuck" frustration handler offers easier problem; tuner records and pulls back coefficient. |
| User runs into the same problem they already passed (track rotation glitch) | Offer: "You've solved this — review or skip?" |

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **LLM-only grading (no test runner)** | Unreliable. Hallucinates. Slow. |
| **Rubric-based open-ended grading from day 1** | High value but expensive to validate. Defer to v1 where we can A/B test rubrics. |
| **No XP cost for hints** | Encourages reflexive hint-click → kills productive struggle. |
| **5-rung hint ladder** | Tested in spec — feels indecisive. 3 is the right number. |

---

## EPIC-009 — Learning tracks

Owns: the curated content sequences for Python and TypeScript fundamentals.

### Track structure

Each track is a directed graph of **concepts** (not lessons). Concept nodes have:

- Name (e.g., "list_comprehensions").
- Prerequisites (e.g., requires `lists` and `for_loops`).
- 4–8 problems tagged to it (from the curated bank).
- A short "intro card" (~150 words) shown the first time the user encounters this concept.

**Tracks for MVP:**

- **Python fundamentals** — control flow → collections → comprehensions → functions → classes → modules → file I/O → standard library highlights → idioms.
- **TypeScript fundamentals** — types → control flow → arrays/objects → functions → modules → async/await → generics intro → idioms.

### UX

- User picks a track at onboarding (or we recommend based on their answers).
- Track progress bar visible on dashboard.
- User can switch tracks in settings — but progress on current track is preserved.
- Concept "intro card" shows the first time we touch a new concept in a session — short, scannable, max 150 words. Single button: "Got it — give me a problem."

### Concept intro card content shape

```
# List comprehensions

In Python, `[expr for x in iterable]` builds a list by applying `expr` to each `x`.
You can filter with `if`: `[x for x in nums if x > 0]`.

When to reach for them: building a new list from an existing one, with optional
filtering. They're often clearer than a `for` loop.

When NOT to: complex multi-statement bodies, or when you're not building a list.

[Got it — give me a problem]
```

**Why this shape.** Most platforms drown new concepts in walls of text. Our bet is the user already googles things; a 150-word card gets them to the practice fast, where the actual learning happens.

### Out of scope for MVP

- DSA track (v1).
- ML / DL / "build an LLM" tracks (v3).
- User-authored tracks (v2+).

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **No structured track — pure adaptive sequence** | Sounds elegant but users want a sense of "where am I going." A track gives orientation. |
| **Rich multi-page lessons per concept (Codecademy-style)** | High production cost; low evidence of efficacy compared to short intro + practice. |
| **User picks any concept any time** | Without prerequisite structure, users hit walls and bounce. Track enforces sensible ordering. |

---

## EPIC-010 — Career-aware curriculum

Owns: the onboarding role question, the recommended-stack mapping, the "why does this matter for you" framing.

### What this looks like in MVP

- Onboarding question 1: "What role are you working toward?" with chips: Backend engineer, Frontend engineer, Full-stack engineer, Data analyst, ML engineer, Just learning, Other.
- The choice maps to a **default track recommendation**:
  - Backend / Full-stack → Python first
  - Frontend / Full-stack → TypeScript first
  - Data analyst → Python first
  - ML engineer → Python first (DL track in v3)
  - Just learning → Python first
  - Other → Python first (and we save the freeform text for v1 JD parser feature)

- The role appears in the **tutor's contextual framing** when relevant. E.g., when a backend learner solves a problem touching dictionaries, tutor might say: "This pattern shows up in route handlers — basically every backend framework uses it." (Concrete career relevance, not generic motivation.)

### Out of scope for MVP

- JD parser / resume gap analysis (v1).
- Multi-role recommendations (v1).
- Role-specific tracks beyond "default language" (v1).

### Why this matters even at MVP scale

Differentiator: most platforms teach generic "programming" — LearnPro teaches *for your career*. Even the small touch of "this matters for your role" in tutor messages is a meaningful differentiator from LeetCode/Codewars.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **No role question, all users get same default** | Loses the differentiator for a 10-second cost. |
| **Full role library with detailed paths in MVP** | Premature — we'd build paths for roles no one chose. Start with the question, expand as we see distribution. |

---

## EPIC-011 — Gamification

Owns: XP, streak, progress bars. **Plus the explicit absence of dark patterns.**

### XP

- Earned per solved problem: `xp = base × difficulty_factor × correctness_multiplier`
  - `base = 10`
  - `difficulty_factor`: 1.0 (easy), 1.5 (medium), 2.0 (hard), 3.0 (expert)
  - `correctness_multiplier`: 1.0 if first-try-pass with no hints; 0.7 if hints used; 0.5 if multiple submits; 0.0 if `Reveal solution` was clicked
- XP is shown as a number in the top bar. No level system in MVP (just a running total). Levels add gamification surface but also pressure — defer to v1 where we can A/B test impact on retention.
- XP cost for hints (5/15/30) is *deducted at click time*. So your displayed XP reflects net.

### Streak

- One day on streak = at least one solved problem.
- **Grace days: 3 per calendar month, auto-applied.** If you miss a day and have grace remaining, the streak doesn't break — a small message says "we used a grace day; you have 2 left this month."
- **No public streak leaderboard.** No "you've broken your 14-day streak!" guilt-trip notification. (See EPIC-012 for the exact notification copy rules.)
- Streak counter shows in the top bar from day 2 onward.

### Per-track progress bar

- Visual: bar with concept dots colored by mastery state (mastered / in-progress / not-yet).
- Hover reveals the concept name. Click jumps to that concept's intro card or recent problems.
- Lives in the dashboard right column.

### What we explicitly do NOT do

| Anti-pattern | Why we refuse |
|---|---|
| "You're losing your streak!" anxiety push notifications | Trains compliance, not learning. Engagement metrics ≠ retention metrics. See [`DIFFERENTIATORS.md`](./DIFFERENTIATORS.md) §7. |
| Public leaderboards | Social pressure is short-term retention juice and long-term churn poison. (Opt-in private cohort leaderboards may come in v2.) |
| Confetti / animations / "ROCK ON!" copy | Patronizing for the audience. Engineering aesthetic. |
| Limited-time event "challenges" with FOMO copy | Casino tactics. Refuse. |
| Daily "lives" you can lose, then have to wait or pay to refill (Duolingo) | Punishes practice. Anti-pedagogy. |
| Streak-buy with money | Monetization-as-coercion. No. |
| Auto-friending or contact-list scraping | Privacy-hostile. No. |

### What good gamification looks like for this audience

- Completion is the reward.
- The streak is a quiet number, not an alarm.
- Progress bar is visual proof of skill growth, not a slot machine.
- XP is a coarse measure of "did I do work" — not a level you grind for status.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Levels (XP → Level 12 → Level 13)** | Adds grind pressure. Defer to v1 with measurement. |
| **Badges for milestones (10 streak, 100 problems)** | Acceptable in moderation; v1 scope. MVP just has progress bar + XP + streak. |
| **No gamification at all** | Loses easy-win retention; users do appreciate seeing "I solved 4 today." |

---

## EPIC-012 — Notifications

Owns: the in-app notification center, browser Web Push, quiet hours.

### Notification types in MVP

| Type | Channel | Trigger | Quiet hours respected? |
|---|---|---|---|
| Daily reminder | Web Push | If user hasn't started today's session by their preferred reminder time | Yes |
| Session abandoned | In-app only | If user starts but doesn't finish a session | No (it's just an in-app dot) |
| Tutor offline / back | In-app | LLM provider down then up | No |
| Daily budget reached | In-app | Token cap hit | No |
| Grace day used | In-app + Web Push | Streak preserved by grace | Yes |
| Concept mastered | In-app | First time skill ≥ 0.8 with confidence | Yes (small celebration) |

### Notification copy rules

| DO | DON'T |
|---|---|
| "Your 30-min session is waiting." | "🔥🔥 You're about to LOSE your streak! 🔥🔥" |
| "Yesterday you got better at list comprehensions. Tomorrow we'll try dict comprehensions." | "Don't let your hard work go to waste!" |
| "You used a grace day — 2 left this month." | "You missed yesterday — get back on track!" |
| "List comprehensions: mastered." | "🏆 ACHIEVEMENT UNLOCKED 🏆" |

**Tone:** factual, brief, respectful of user's time. Same tutor voice rules apply.

### Quiet hours

- Configurable per user. Defaults to 21:00–08:00 local time.
- Web Push notifications during quiet hours are **suppressed entirely**, not queued. (Queueing creates a notification storm at 8am — worse than no notification.)
- In-app notifications still appear in the bell icon during quiet hours; user just isn't pinged.

### UX

- **Bell icon** in top bar with count badge for unread.
- Clicking opens a dropdown with a scroll of recent notifications, newest first.
- "Mark all read" link.
- "Notification settings" link → settings page.
- Settings page lets user: enable/disable each notification type per channel, set quiet hours.

### Out of scope for MVP

- Email digests (v1).
- WhatsApp via Meta Cloud API (v2 — requires business verification, lots of compliance).
- SMS (deferred indefinitely; cost + spam filter risk).

### Edge cases

| Case | Behavior |
|---|---|
| User has Web Push permission denied | In-app notifications still work. Show a one-time "enable browser notifications for daily reminders" banner; dismissable forever. |
| User changes timezone (travel) | Reminders recompute against new local time. Quiet hours follow user. |
| Multiple browsers / devices, all subscribed to push | Send to all (one of them is "the device they have on right now"). Deduplicate by `notification_id`. |

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Aggressive re-engagement push ("we miss you!")** | Anti-pattern. Users will turn off push, and we lose the channel for legit reminders. |
| **Email reminders in MVP** | Requires SMTP setup for self-hosters; extra ops cost. Web Push is free and works. Email digest comes in v1 with proper opt-in flow. |
| **Slack / Discord integration** | Social-platform tax we're not paying. Out of scope. |

---

## EPIC-013 — Cross-platform (responsive web baseline)

Owns: responsive layouts, breakpoint behavior, what's usable on what device. **PWA + mobile wrapper deferred.**

### MVP target devices

- **Primary: desktop browser, ≥ 1280px wide.** Editor + tutor side-by-side fits.
- **Secondary: tablet, 768–1279px wide.** Editor full-width; tutor becomes a bottom drawer.
- **Tertiary: mobile, < 768px.** Dashboard, profile, settings, history all work. **Editor page renders a "use a wider screen for the editor" message** with a deep link to the same problem on desktop. (We don't ship a broken editor experience just to claim mobile support.)

### Why no mobile editor in MVP

Monaco on mobile is bad. The keyboard covers half the screen, autocomplete fights virtual keyboards, and one-handed editing is miserable. Trying to make it work consumes weeks for a low-quality outcome. Better: be honest, send the user to desktop, ship the rest of the surface mobile-OK.

PWA + Capacitor mobile wrapper come in v1 / v2 once the loop is proven.

### Browser support

- **Modern Chromium** (Chrome, Edge, Brave, Arc) — primary.
- **Firefox** — supported, tested.
- **Safari** — supported, tested. Note: WebSocket reliability on Safari mobile is historically flaky; we use SSE fallback.
- **No IE / no legacy Edge.** No.

### Edge cases

| Case | Behavior |
|---|---|
| User opens editor page on mobile | Show "use a wider screen — your work is here when you're back" with a deep link copy button. |
| User has slow network | Tutor / sandbox UX must degrade gracefully. We pre-warm sandbox during onboarding; we stream tutor responses progressively. |
| User offline | Show offline banner; dashboard + profile served from cache; editor page disabled. PWA offline is a v1 enhancement. |

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Native iOS / Android app in MVP** | Massive scope; capacitor wrapper is the right v2 move. |
| **Make editor work on mobile** | Bad UX; weeks of work; users won't actually do serious practice on a 6-inch screen. Be honest. |
| **Drop responsive entirely, desktop-only** | Loses the "check progress on phone" use case which is real and cheap. |

---

## EPIC-015 — SaaS readiness primitives

Owns: the architectural primitives that make the eventual SaaS migration a config flip. **Most of this is invisible to users.**

### MVP user-visible surface

- **Settings page → "Account" section:**
  - Email (from auth)
  - Display name (editable)
  - Daily time budget
  - Daily AI budget reset time (timezone)
  - Preferred reminder time
  - Quiet hours
  - **Self-hosted: provider configuration** (LLM provider, API key — collapsed under "Advanced" with a warning: "Changing this requires restart")
- **Settings page → "Data" section:**
  - **Export my data** button → JSON download (GDPR baseline; required by EPIC-002 / STORY-026).
  - "Delete my account" button (v1 — out of MVP scope; for self-host, user just deletes their row).

### Adapter pattern surface

All hidden from end users in MVP. The adapters exist in code (`SandboxProvider`, `LLMProvider`, `NotificationChannel`, `ObjectStore`, `Auth`, `Telemetry`) but the UI doesn't yet expose configuration of them all — only LLM provider in the Advanced section.

### `org_id` everywhere

- Every database row carries `user_id` AND `org_id`. In MVP single-user mode, `org_id = "default"` for everyone. Schema is set up so the multi-tenant flip is a config change, not a migration.
- This is purely architectural; users never see `org_id` in MVP.

### Out of scope for MVP

- Billing.
- Multi-user invites / org management UI.
- Admin panel.
- Plan tiers.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **No `org_id` until SaaS launch** | Migration becomes a multi-week schema change touching every table — high risk of bugs and data loss. Add the column day 1 for free. |
| **Build full multi-tenant UI in MVP** | YAGNI. Defer to v3. |

---

## EPIC-016 — Security & anti-cheat

Owns: sandbox security UX, anti-cheat philosophy (covered in EPIC-004 pedagogy), data security visible to user.

### Sandbox security visible to user

Users see almost nothing — by design. Hardening is invisible when it works:

- Network-disabled sandbox: when user code attempts a network call, error message is "Network access is disabled. Sandboxes are isolated for safety." (Brief, no lecture.)
- Memory cap exceeded: "Out of memory. Are you building a list bigger than necessary?" (Frames as a learning hint.)
- Timeout: "Timed out at 10s." (No security framing.)

Surfacing security as a *feature* in marketing is fine; surfacing it as friction in the product is not.

### Anti-cheat (covered above in EPIC-004)

- Soft signals only in MVP (`paste_ratio`, etc.).
- Optional "I got help on this one" toggle.
- Never accuse, never police, never lock features behind anti-cheat.

### Data security visible to user

- **HTTPS everywhere** (obvious; called out only because self-hosters need to know).
- **Settings page** has a "Sessions" subsection (v1) showing active logins.
- **Password / passkey management** — Auth.js handles; user sees standard "manage credentials" UI.
- **Self-hosters**: a `SECURITY.md` in the repo documents the threat model, hardening checklist, and how to report vulns. Linked from settings.

### Out of scope for MVP

- 2FA (v1).
- SSO / SAML (v3 SaaS).
- Audit logs (v3 SaaS).
- Active session management UI (v1).

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Run user code without sandboxing for MVP ("we trust them")** | One-shot total compromise of the host. Refuse. |
| **Show security details in product UI** | Wastes user attention. Self-hosters who care will read SECURITY.md. |
| **Keystroke-based anti-cheat in MVP** | High effort, ML-ish, not worth it before validating the loop works. v1+. |

---

## Cross-cutting: edge cases & error states

These apply across all epics. Single source of truth for what "errors" look like in LearnPro.

### Network failures

| Failure | UX |
|---|---|
| WebSocket drops mid-stream | Auto-reconnect in 1s. Show: "Reconnecting…" thin banner. If 3 reconnect attempts fail: "Offline — your work is saved. Refresh to retry." |
| HTTP 5xx on save | Retry with exponential backoff. After 3 retries: red toast "Save failed — work is in your local browser; please refresh." |
| HTTP 5xx on Submit | Show: "Couldn't grade — try again." Submit doesn't count against attempts. |

### LLM-specific failures

| Failure | UX |
|---|---|
| Anthropic 429 rate-limit | Tutor panel: "Tutor's catching up — back in a moment." Auto-retry with backoff. |
| Anthropic 5xx | Same as above; longer backoff. |
| Anthropic refusal / safety stop | Generic "Couldn't generate a response — try rephrasing." (Don't expose Claude's safety message to user.) |
| Daily token budget hit | Tutor stops; tests still grade. "AI tutor budget reached for today. Returns at midnight." |

### Sandbox failures

(Detailed in EPIC-003 above.)

### State-corruption failures

| Failure | UX |
|---|---|
| Session is somehow in inconsistent state (e.g., problem completed but objective not checked) | Auto-repair on next session start; log telemetry. User sees nothing. |
| Profile shows skill > 1.0 (bug) | Clamp display to 1.0; log warning; flag for v1 admin review tool. |

### "It's broken — what do I do" UX

Bottom-right of every page: a tiny **Help** chip → opens a dialog with:

- Common fixes ("refresh, log out and back in").
- Link to `STATUS.md` page (in MVP, just a static "no known issues" page).
- Self-host: link to GitHub issues with a pre-filled bug template containing client-side telemetry.
- SaaS (v3): contact support.

---

## Cross-cutting: copy & tone

LearnPro's voice in product copy:

- **Direct.** "Run your code." not "Click here to run your code."
- **Specific.** Reference the user's actual context.
- **Brief.** A 4-word label beats a 12-word one.
- **Quietly confident.** No hyperbole. No "amazing!" No "powerful!"
- **Engineer-appropriate.** Assume technical literacy. Don't define "function" in the editor page.
- **Anti-emoji.** No emoji in tutor messages, button labels, headers, notifications. Reasonable in `:mastered:`-style status icons (small, monochrome).

Phrases to **never use**:
- "You're crushing it!"
- "Amazing job!"
- "Let's level up!"
- "Don't give up!"
- "This is fun!" (the user decides if it's fun)
- "Powered by AI" (yes it is, no one cares)
- "Unlock new content!"
- Any sentence with "literally."

Phrases that **are** the voice:
- "Done."
- "Runs in O(n²) — there's an O(n) version. Want to see?"
- "Stuck? Walk me through line 4."
- "Tomorrow we'll look at dict comprehensions."
- "Tutor's reconnecting."

---

## Open questions parked for Phase C / future grooming

These are surfaced here so they don't get lost; they don't need answers in Phase A.

- **Pricing / plan limits** when SaaS launches — what's the line between free and paid? (v3 EPIC-015 follow-up.)
- **Cohort / classroom mode** — do we ever support a teacher view of a small group of learners? (v3 idea.)
- **Tutor "personality" customization** — can the user pick from 2–3 tutor personas? (Probably no — adds complexity, validation cost; defer.)
- **Voice tutor pedagogy** — when voice ships in v1, how does the question-vs-reveal heuristic translate to spoken form? (Phase C / EPIC-008 grooming.)
- **Project-based learning UX** — covered briefly in roadmap; needs full spec when v2 nears. (Phase C grooming.)

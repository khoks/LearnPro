# `.github/workflows/`

GitHub Actions workflow definitions.

**Workflows:**

- [`ci.yml`](./ci.yml) — on every PR + push to `main`: lint, typecheck, unit tests, build, format check.
- [`prompt-eval.yml`](./prompt-eval.yml) — on PRs that touch `packages/prompts/src/**` or `packages/agent/evals/**`: runs the [STORY-035](../../project/stories/STORY-035-prompt-eval-harness.md) harness, posts a markdown summary as a PR comment, fails on regressions vs. the most-recent committed report on `main`. Requires the `ANTHROPIC_API_KEY` secret.

**Planned workflows:**

- `sandbox-breakout.yaml` — runs the [STORY-010](../../project/stories/STORY-010-sandbox-hardening.md) breakout suite against the runner image. Must pass on every PR that touches `packages/sandbox/` or `infra/docker/`.
- `release.yaml` — builds and tags release images (v3+ SaaS).

**Hard rule:** never use `--privileged` Docker flags in CI either. The CI environment is a target for the same hardening rules as production.

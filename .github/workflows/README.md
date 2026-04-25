# `.github/workflows/`

GitHub Actions workflow definitions. **Empty for now** — CI is set up during the MVP build, not at scaffolding time.

**Planned workflows (added in EPIC-002 / EPIC-003):**

- `ci.yaml` — on every PR: lint, typecheck, unit tests, build.
- `sandbox-breakout.yaml` — runs the [STORY-010](../../project/stories/STORY-010-sandbox-hardening.md) breakout suite against the runner image. Must pass on every PR that touches `packages/sandbox/` or `infra/docker/`.
- `prompt-eval.yaml` — runs the prompt-eval harness on every PR that touches `packages/agent/prompts/` (v1).
- `release.yaml` — builds and tags release images (v3+ SaaS).

**Hard rule:** never use `--privileged` Docker flags in CI either. The CI environment is a target for the same hardening rules as production.

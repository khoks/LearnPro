# Eval reports

Per-run output of the prompt eval harness (STORY-035) lives here. Each report is a JSON
file whose filename is the ISO-stamped `generated_at` of the run.

These files are committed (rather than `.gitignore`d) so historical drift can be charted by
diffing in git. They're small (~10–50 KB) and the volume per PR is bounded — we only run the
harness on PRs that touch `packages/prompts/src/**` or `packages/agent/evals/**`.

To run locally:

```sh
pnpm --filter @learnpro/agent eval                 # full suite
pnpm --filter @learnpro/agent eval -- --filter hint
pnpm --filter @learnpro/agent eval -- --baseline packages/agent/evals/reports/<old>.json
```

`ANTHROPIC_API_KEY` must be set. Cost: ~$0.50–$2 per full run (Haiku judge).

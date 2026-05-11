// STORY-034a — live-LLM A/B CLI. Usage:
//   LEARNPRO_RUN_LIVE_LLM_EVAL=1 ANTHROPIC_API_KEY=... \
//     pnpm --filter @learnpro/agent exec tsx evals/grader-ab-cli.ts
//
// Without `LEARNPRO_RUN_LIVE_LLM_EVAL=1` the CLI exits 0 with a short note so the prompt-eval
// workflow can `node evals/grader-ab-cli.ts` without burning Anthropic budget.

import { AnthropicProvider, AnthropicSdkTransport, ANTHROPIC_HAIKU } from "@learnpro/llm";
import {
  liveLlmEvalEnabled,
  loadGraderAbCases,
  runGraderAb,
  writeGraderAbReport,
} from "./grader-ab.js";

async function main(): Promise<void> {
  if (!liveLlmEvalEnabled()) {
    console.log(
      "[grader-ab] LEARNPRO_RUN_LIVE_LLM_EVAL is not set to 1 — skipping live-LLM A/B run.",
    );
    console.log(
      "[grader-ab] To run: LEARNPRO_RUN_LIVE_LLM_EVAL=1 ANTHROPIC_API_KEY=... " +
        "pnpm --filter @learnpro/agent exec tsx evals/grader-ab-cli.ts",
    );
    return;
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set. Required when LEARNPRO_RUN_LIVE_LLM_EVAL=1.",
    );
    process.exit(2);
  }

  const transport = new AnthropicSdkTransport({ apiKey });
  const llm = new AnthropicProvider({ transport });

  const cases = await loadGraderAbCases();
  console.log(`[grader-ab] loaded ${cases.transcripts.length} transcript(s).`);

  const report = await runGraderAb({
    llm,
    cases,
    prompt_under_test_model: ANTHROPIC_HAIKU,
  });

  const path = await writeGraderAbReport(report);
  console.log(`[grader-ab] wrote markdown report → ${path}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

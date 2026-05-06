// STORY-035 — eval CLI. Usage:
//   pnpm --filter @learnpro/agent eval                        # full suite, current prompts
//   pnpm --filter @learnpro/agent eval -- --filter hint       # only hint cases
//   pnpm --filter @learnpro/agent eval -- --baseline <path>   # diff against a prior report
//   pnpm --filter @learnpro/agent eval -- --markdown-out <p>  # write a PR-comment-ready md
//
// Requires ANTHROPIC_API_KEY in the environment. Cost: ~$0.50–$2 per full run.

import { readFile, writeFile } from "node:fs/promises";
import { AnthropicSdkTransport, AnthropicProvider, ANTHROPIC_HAIKU } from "@learnpro/llm";
import { loadAllEvalCases } from "./loader.js";
import {
  diffReports,
  renderReportMarkdown,
  runEvals,
  writeReportToFile,
  type ReportDiff,
} from "./runner.js";
import {
  EvalCategorySchema,
  EvalReportSchema,
  type EvalCategory,
  type EvalReport,
} from "./types.js";

interface CliFlags {
  filter?: EvalCategory;
  baseline?: string;
  markdownOut?: string;
}

function parseArgs(argv: ReadonlyArray<string>): CliFlags {
  const out: CliFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      // pnpm forwards "--" through; ignore it as a separator.
      continue;
    } else if (arg === "--filter") {
      const v = argv[++i];
      if (!v) throw new Error("--filter requires a value");
      out.filter = EvalCategorySchema.parse(v);
    } else if (arg === "--baseline") {
      const v = argv[++i];
      if (!v) throw new Error("--baseline requires a path");
      out.baseline = v;
    } else if (arg === "--markdown-out") {
      const v = argv[++i];
      if (!v) throw new Error("--markdown-out requires a path");
      out.markdownOut = v;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`Usage: pnpm --filter @learnpro/agent eval -- [flags]

Flags:
  --filter <category>     Run only one category: hint | grade | onboarding | session-plan
  --baseline <path>       Compare against a prior report (writes a diff to the markdown summary)
  --markdown-out <path>   Write the markdown summary to this file (e.g. for posting as a PR comment)

Env vars:
  ANTHROPIC_API_KEY       Required. Used for the prompt-under-test + judge calls.
`);
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set. Set it in your shell or .env to run the eval suite.",
    );
    console.error("(See `pnpm --filter @learnpro/agent eval -- --help`.)");
    process.exit(2);
  }

  const transport = new AnthropicSdkTransport({ apiKey });
  const llm = new AnthropicProvider({ transport });

  const cases = await loadAllEvalCases();
  console.log(`[evals] loaded ${cases.length} case(s) from disk.`);

  const report = await runEvals({
    llm,
    cases,
    ...(flags.filter !== undefined && { filter: flags.filter }),
    judge_model: ANTHROPIC_HAIKU,
    prompt_under_test_model: ANTHROPIC_HAIKU,
  });

  const reportPath = await writeReportToFile(report);
  console.log(`[evals] wrote report → ${reportPath}`);

  let diff: ReportDiff | undefined;
  if (flags.baseline) {
    const baseline = await loadReport(flags.baseline);
    diff = diffReports(baseline, report);
    console.log(
      `[evals] diff vs baseline: overall Δ ${(diff.overall_delta * 100).toFixed(1)}pp, ` +
        `newly failing: ${diff.newly_failing_case_ids.length}, ` +
        `newly passing: ${diff.newly_passing_case_ids.length}`,
    );
  }

  const markdown = renderReportMarkdown(report, diff);
  if (flags.markdownOut) {
    await writeFile(flags.markdownOut, markdown, "utf8");
    console.log(`[evals] wrote markdown → ${flags.markdownOut}`);
  }

  // Exit non-zero if regressions were introduced (CI-friendly).
  if (diff && diff.newly_failing_case_ids.length > 0) {
    console.error(
      `[evals] ${diff.newly_failing_case_ids.length} case(s) regressed vs baseline. Failing CI.`,
    );
    process.exit(1);
  }
}

async function loadReport(path: string): Promise<EvalReport> {
  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Baseline report ${path} is not valid JSON: ${(e as Error).message}`);
  }
  return EvalReportSchema.parse(parsed);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

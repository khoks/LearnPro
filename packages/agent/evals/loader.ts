// Loader + parser for canned eval transcripts. Files live in evals/transcripts/<id>.json.
// The loader Zod-parses each file at the boundary and surfaces filename in any parse error
// so authoring mistakes are easy to debug.

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EvalCaseSchema, type EvalCase } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS_DIR = join(HERE, "transcripts");

export async function loadAllEvalCases(): Promise<EvalCase[]> {
  const entries = await readdir(TRANSCRIPTS_DIR);
  const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
  const cases: EvalCase[] = [];
  for (const file of jsonFiles) {
    const path = join(TRANSCRIPTS_DIR, file);
    const raw = await readFile(path, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Eval case ${file}: invalid JSON — ${(e as Error).message}`);
    }
    const result = EvalCaseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Eval case ${file}: schema validation failed — ${result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    if (result.data.id !== file.replace(/\.json$/, "")) {
      throw new Error(
        `Eval case ${file}: id "${result.data.id}" does not match filename. Rename one to match.`,
      );
    }
    cases.push(result.data);
  }
  return cases;
}

export function transcriptsDir(): string {
  return TRANSCRIPTS_DIR;
}

// STORY-010 — AC-4 — A grep for `--privileged` returns zero results across the codebase
// and infra (only in pure documentation describing the no-privileged rule, which we
// allowlist explicitly).
//
// The check walks the working tree from the repo root and asserts no tracked file outside
// the allowlist contains the `--privileged` token. Files under the allowlist are docs and
// tracker artifacts that quote the rule in plain text.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// packages/sandbox/test/breakout/no-privileged-flag.test.ts -> repo root is four levels up.
const REPO_ROOT = join(HERE, "..", "..", "..", "..");

const SCAN_DIRS = ["infra", "packages", "apps", "scripts", "services", "infra/docker"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  ".next",
  "coverage",
  ".git",
  ".pnpm-store",
]);

// Files that legitimately mention the literal `--privileged` token because they *describe
// the prohibition* — never because they invoke it. Each entry is justified inline. Adding
// to this list requires reviewer attention.
const ALLOWLIST_FILES = new Set<string>([
  // This test file: the regex needle and explanatory comments use the literal.
  "packages/sandbox/test/breakout/no-privileged-flag.test.ts",
  // docker-compose dev stack: header comment + inline reminder reaffirming the prohibition.
  "infra/docker/docker-compose.dev.yaml",
  // infra docs: re-states the rule for human readers of the directory.
  "infra/docker/README.md",
]);

const NEEDLE = "--privileged";

interface Hit {
  relPath: string;
  line: number;
  text: string;
}

function toRel(absPath: string): string {
  return absPath
    .slice(REPO_ROOT.length + 1)
    .split(sep)
    .join(posix.sep);
}

function walk(dirAbs: string, hits: Hit[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dirAbs);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dirAbs, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(abs, hits);
      continue;
    }
    if (!st.isFile()) continue;
    if (st.size > 4 * 1024 * 1024) continue;
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!text.includes(NEEDLE)) continue;
    const rel = toRel(abs);
    if (ALLOWLIST_FILES.has(rel)) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.includes(NEEDLE)) {
        hits.push({ relPath: rel, line: i + 1, text: line.trim() });
      }
    }
  }
}

describe("hardening: AC-4 — no `--privileged` in the codebase", () => {
  it("no scanned source/infra/script file mentions --privileged outside the allowlist", () => {
    const hits: Hit[] = [];
    for (const sub of SCAN_DIRS) {
      walk(join(REPO_ROOT, sub), hits);
    }
    if (hits.length > 0) {
      const formatted = hits.map((h) => `  ${h.relPath}:${h.line}: ${h.text}`).join("\n");
      throw new Error(
        `Found ${hits.length} mention(s) of "${NEEDLE}" in scanned trees:\n${formatted}`,
      );
    }
    expect(hits).toEqual([]);
  });
});

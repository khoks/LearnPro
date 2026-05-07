import type {
  CompleteRequest,
  CompleteResponse,
  EmbedRequest,
  EmbedResponse,
  LLMProvider,
  StreamChunk,
  ToolCallRequest,
  ToolCallResponse,
} from "@learnpro/llm";
import type { CheatsheetEpisodeInput } from "@learnpro/prompts";
import { describe, expect, it } from "vitest";
import {
  CheatsheetAgentResultSchema,
  CheatsheetEntrySchema,
  cheatsheetAgent,
  entriesToMarkdown,
  parseCheatsheetResponse,
} from "./cheatsheet.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function fakeLlm(responseText: string): LLMProvider & { calls: CompleteRequest[] } {
  const calls: CompleteRequest[] = [];
  return {
    name: "fake",
    calls,
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      calls.push(req);
      return {
        text: responseText,
        model: req.model ?? "claude-haiku-4-5-20251001",
        finish_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 200 },
      };
    },
    async *stream(_req: CompleteRequest): AsyncIterable<StreamChunk> {
      yield { delta: "", done: true };
    },
    async embed(_req: EmbedRequest): Promise<EmbedResponse> {
      return { vector: [], model: "voyage-3", usage: {} };
    },
    async toolCall(_req: ToolCallRequest): Promise<ToolCallResponse> {
      return {
        text: "",
        tool_calls: [],
        model: "fake",
        finish_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  };
}

const sampleEpisodes: CheatsheetEpisodeInput[] = [
  {
    problem_slug: "two-sum",
    problem_name: "Two sum",
    language: "python",
    difficulty: "easy",
    concept_tags: ["arrays", "hash-map"],
    final_outcome: "passed",
    hints_used: 0,
    user_code_excerpt: "def solve(nums, target): ...",
    problem_statement: "Find two numbers that sum to target.",
  },
  {
    problem_slug: "reverse-string",
    problem_name: "Reverse string",
    language: "python",
    difficulty: "easy",
    concept_tags: ["two-pointer"],
    final_outcome: "failed",
    hints_used: 2,
    user_code_excerpt: "def solve(s): return s[::-1]",
    problem_statement: "Reverse a string in place.",
  },
];

const sampleEntries = [
  {
    concept: "Hash-map lookup",
    definition: "Trade space for time when scanning a sequence for a paired value.",
    code_example:
      "seen = {}\nfor i, x in enumerate(nums):\n    if target - x in seen: return [seen[target - x], i]",
    gotcha: "Insert AFTER the lookup, otherwise a single-element pair can match itself.",
  },
  {
    concept: "Two-pointer reversal",
    definition: "Walk two indices toward each other, swapping at each step.",
    code_example: "i, j = 0, len(s) - 1\nwhile i < j: s[i], s[j] = s[j], s[i]; i+=1; j-=1",
    gotcha: "Stop when i < j, not i <= j, or you'll re-swap the middle.",
  },
];

describe("CheatsheetEntrySchema", () => {
  it("accepts a fully-filled entry", () => {
    expect(CheatsheetEntrySchema.parse(sampleEntries[0]!)).toEqual(sampleEntries[0]!);
  });

  it("rejects empty fields", () => {
    expect(() =>
      CheatsheetEntrySchema.parse({
        concept: "",
        definition: "x",
        code_example: "x",
        gotcha: "x",
      }),
    ).toThrow();
  });

  it("rejects entries with overlong fields", () => {
    expect(() =>
      CheatsheetEntrySchema.parse({
        concept: "x".repeat(200),
        definition: "x",
        code_example: "x",
        gotcha: "x",
      }),
    ).toThrow();
  });
});

describe("parseCheatsheetResponse", () => {
  it("parses a clean response", () => {
    const out = parseCheatsheetResponse(JSON.stringify({ entries: sampleEntries }));
    expect(out?.entries).toHaveLength(2);
    expect(out?.entries[0]?.concept).toBe("Hash-map lookup");
  });

  it("strips ```json fences", () => {
    const text = "```json\n" + JSON.stringify({ entries: sampleEntries }) + "\n```";
    const out = parseCheatsheetResponse(text);
    expect(out?.entries).toHaveLength(2);
  });

  it("strips bare ``` fences", () => {
    const text = "```\n" + JSON.stringify({ entries: sampleEntries }) + "\n```";
    const out = parseCheatsheetResponse(text);
    expect(out?.entries).toHaveLength(2);
  });

  it("drops malformed individual entries but keeps valid ones", () => {
    const out = parseCheatsheetResponse(
      JSON.stringify({
        entries: [sampleEntries[0], { concept: "x" /* missing fields */ }, sampleEntries[1]],
      }),
    );
    expect(out?.entries).toHaveLength(2);
    expect(out?.entries[0]?.concept).toBe("Hash-map lookup");
    expect(out?.entries[1]?.concept).toBe("Two-pointer reversal");
  });

  it("returns null on non-JSON", () => {
    expect(parseCheatsheetResponse("totally not JSON")).toBeNull();
  });

  it("returns null on missing entries field", () => {
    expect(parseCheatsheetResponse(JSON.stringify({ items: [] }))).toBeNull();
  });

  it("returns null on entries that is not an array", () => {
    expect(parseCheatsheetResponse(JSON.stringify({ entries: "not array" }))).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(parseCheatsheetResponse("")).toBeNull();
    expect(parseCheatsheetResponse("   ")).toBeNull();
  });

  it("returns an empty entries array when entries is an empty array (no fallback)", () => {
    const out = parseCheatsheetResponse(JSON.stringify({ entries: [] }));
    expect(out?.entries).toEqual([]);
  });
});

describe("cheatsheetAgent", () => {
  it("calls the LLM with the cheatsheet prompt_version, reflection role, and Haiku by default", async () => {
    const llm = fakeLlm(JSON.stringify({ entries: sampleEntries }));
    await cheatsheetAgent({ llm, user_id: USER_ID, episodes: sampleEpisodes });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.role).toBe("reflection");
    expect(llm.calls[0]?.model).toMatch(/haiku/);
    expect(llm.calls[0]?.prompt_version).toMatch(/^cheatsheet-v1/);
    expect(llm.calls[0]?.user_id).toBe(USER_ID);
  });

  it("happy path: returns up to max_entries parsed entries (fallback_used=false)", async () => {
    const llm = fakeLlm(JSON.stringify({ entries: sampleEntries }));
    const out = await cheatsheetAgent({
      llm,
      user_id: USER_ID,
      episodes: sampleEpisodes,
    });
    expect(out.fallback_used).toBe(false);
    expect(out.entries).toHaveLength(2);
    expect(out.entries[0]?.concept).toBe("Hash-map lookup");
    expect(CheatsheetAgentResultSchema.parse(out)).toEqual(out);
  });

  it("caps entries at max_entries even if the LLM returns more", async () => {
    const tooMany = Array.from({ length: 8 }, (_, i) => ({
      concept: `Concept ${i}`,
      definition: "definition text",
      code_example: "code",
      gotcha: "gotcha",
    }));
    const llm = fakeLlm(JSON.stringify({ entries: tooMany }));
    const out = await cheatsheetAgent({
      llm,
      user_id: USER_ID,
      episodes: sampleEpisodes,
      max_entries: 3,
    });
    expect(out.entries).toHaveLength(3);
  });

  it("on parse failure: empty entries with fallback_used=true (best-effort, never throws)", async () => {
    const llm = fakeLlm("not JSON at all");
    const out = await cheatsheetAgent({
      llm,
      user_id: USER_ID,
      episodes: sampleEpisodes,
    });
    expect(out.fallback_used).toBe(true);
    expect(out.entries).toEqual([]);
  });

  it("on empty episodes: short-circuits (no LLM call) and returns empty entries", async () => {
    const llm = fakeLlm(JSON.stringify({ entries: sampleEntries }));
    const out = await cheatsheetAgent({ llm, user_id: USER_ID, episodes: [] });
    expect(llm.calls).toHaveLength(0);
    expect(out.entries).toEqual([]);
    expect(out.fallback_used).toBe(false);
  });

  it("clamps max_entries above 6 to 6, below 1 to 1", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        entries: Array.from({ length: 8 }, (_, i) => ({
          concept: `c${i}`,
          definition: "d",
          code_example: "x",
          gotcha: "g",
        })),
      }),
    );
    // max_entries above 6 → clamped to 6
    const high = await cheatsheetAgent({
      llm,
      user_id: USER_ID,
      episodes: sampleEpisodes,
      max_entries: 99,
    });
    expect(high.entries).toHaveLength(6);

    // max_entries below 1 → clamped to 1
    const low = await cheatsheetAgent({
      llm,
      user_id: USER_ID,
      episodes: sampleEpisodes,
      max_entries: 0,
    });
    expect(low.entries).toHaveLength(1);
  });

  it("respects an explicit model override", async () => {
    const llm = fakeLlm(JSON.stringify({ entries: sampleEntries }));
    await cheatsheetAgent({
      llm,
      user_id: USER_ID,
      episodes: sampleEpisodes,
      model: "claude-sonnet-4-5",
    });
    expect(llm.calls[0]?.model).toBe("claude-sonnet-4-5");
  });

  it("user prompt mentions the failed/hint-heavy episode so the agent prioritises it", async () => {
    const llm = fakeLlm(JSON.stringify({ entries: sampleEntries }));
    await cheatsheetAgent({ llm, user_id: USER_ID, episodes: sampleEpisodes });
    const userMsg = String(llm.calls[0]?.messages[0]?.content ?? "");
    expect(userMsg).toMatch(/reverse-string/);
    expect(userMsg).toMatch(/failed/);
    expect(userMsg).toMatch(/hint/);
  });
});

describe("entriesToMarkdown", () => {
  it("renders the fixed template per entry: concept heading + definition + code block + gotcha", () => {
    const md = entriesToMarkdown(sampleEntries, {
      title: "Test",
      date: new Date("2026-05-06T12:00:00Z"),
    });
    expect(md).toContain("# Test");
    expect(md).toContain("_Generated on 2026-05-06_");
    expect(md).toContain("## Hash-map lookup");
    expect(md).toContain("Trade space for time");
    expect(md).toContain("```");
    expect(md).toContain("seen = {}");
    expect(md).toContain("**Gotcha:** Insert AFTER the lookup");
    expect(md).toContain("## Two-pointer reversal");
  });

  it("renders an empty-state when there are no entries", () => {
    const md = entriesToMarkdown([], { date: new Date("2026-05-06T12:00:00Z") });
    expect(md).toContain("# Personal cheatsheet");
    expect(md).toContain("_No entries yet");
    expect(md).not.toContain("##"); // no entry headings
  });

  it("preserves the order of entries (reading-flow stability)", () => {
    const md = entriesToMarkdown(sampleEntries);
    const hashIdx = md.indexOf("Hash-map lookup");
    const twoPointerIdx = md.indexOf("Two-pointer reversal");
    expect(hashIdx).toBeGreaterThan(0);
    expect(twoPointerIdx).toBeGreaterThan(hashIdx);
  });
});

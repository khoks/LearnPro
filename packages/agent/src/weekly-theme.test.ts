import { describe, expect, it } from "vitest";
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
import { WEEKLY_THEME_PROMPT_VERSION } from "@learnpro/prompts";
import {
  generateWeeklyTheme,
  parseWeeklyThemeResponse,
  WEEKLY_THEME_MAX_CHARS,
  WEEKLY_THEME_MAX_WORDS,
} from "./weekly-theme.js";

// STORY-046c — tests cover:
//   - Pure parser: clean JSON / fenced JSON / garbage / schema-failing
//   - Coach-voice rejections: forbidden substrings, exclamation, all-caps imperative
//   - Length rejections: > MAX_WORDS, > MAX_CHARS
//   - generateWeeklyTheme happy path: prompt version, model, role, user_id wiring
//   - Empty concepts → null (don't even call LLM)
//   - Transient LLM failure → null (caller falls back)

function fakeLLM(responses: string[]): LLMProvider & { calls: CompleteRequest[] } {
  const calls: CompleteRequest[] = [];
  let idx = 0;
  return {
    name: "fake",
    calls,
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      calls.push(req);
      const text = responses[Math.min(idx, responses.length - 1)] ?? "";
      idx += 1;
      return {
        text,
        model: req.model ?? "claude-haiku-4-5-20251001",
        finish_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 20 },
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

function failingLLM(error: Error): LLMProvider {
  return {
    name: "failing",
    async complete(_req: CompleteRequest): Promise<CompleteResponse> {
      throw error;
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

describe("parseWeeklyThemeResponse — STORY-046c", () => {
  it("parses a clean JSON object with a valid theme", () => {
    const out = parseWeeklyThemeResponse('{"theme":"Building blocks of declarative Python"}');
    expect(out).not.toBeNull();
    expect(out?.theme).toBe("Building blocks of declarative Python");
  });

  it("strips ```json fences before parsing", () => {
    const out = parseWeeklyThemeResponse(
      '```json\n{"theme":"Reading the room with hash maps"}\n```',
    );
    expect(out).not.toBeNull();
    expect(out?.theme).toBe("Reading the room with hash maps");
  });

  it("strips bare ``` fences before parsing", () => {
    const out = parseWeeklyThemeResponse('```\n{"theme":"Shaping data into boxes"}\n```');
    expect(out).not.toBeNull();
    expect(out?.theme).toBe("Shaping data into boxes");
  });

  it("trims surrounding whitespace from the theme", () => {
    const out = parseWeeklyThemeResponse('{"theme":"  Loops and lists  "}');
    expect(out?.theme).toBe("Loops and lists");
  });

  it("returns null on garbage", () => {
    expect(parseWeeklyThemeResponse("not json")).toBeNull();
    expect(parseWeeklyThemeResponse("")).toBeNull();
    expect(parseWeeklyThemeResponse("   ")).toBeNull();
  });

  it("returns null when the JSON shape is wrong (missing theme)", () => {
    expect(parseWeeklyThemeResponse('{"name":"foo"}')).toBeNull();
  });

  it("returns null when theme is empty after trim", () => {
    expect(parseWeeklyThemeResponse('{"theme":"   "}')).toBeNull();
    expect(parseWeeklyThemeResponse('{"theme":""}')).toBeNull();
  });

  it("rejects themes longer than MAX_CHARS", () => {
    expect(WEEKLY_THEME_MAX_CHARS).toBe(80);
    const tooLong = "a".repeat(81);
    const out = parseWeeklyThemeResponse(JSON.stringify({ theme: tooLong }));
    expect(out).toBeNull();
  });

  it("rejects themes with more than MAX_WORDS words", () => {
    expect(WEEKLY_THEME_MAX_WORDS).toBe(8);
    const out = parseWeeklyThemeResponse(
      JSON.stringify({ theme: "one two three four five six seven eight nine" }),
    );
    expect(out).toBeNull();
  });

  it("accepts a theme exactly at MAX_WORDS", () => {
    const out = parseWeeklyThemeResponse(
      JSON.stringify({ theme: "one two three four five six seven eight" }),
    );
    expect(out).not.toBeNull();
  });

  it("rejects themes containing exclamation points", () => {
    const out = parseWeeklyThemeResponse(JSON.stringify({ theme: "Crush list comprehensions!" }));
    expect(out).toBeNull();
  });

  it("rejects themes containing fire emoji", () => {
    const out = parseWeeklyThemeResponse(JSON.stringify({ theme: "🔥 List comprehensions" }));
    expect(out).toBeNull();
  });

  it("rejects themes containing warning emoji", () => {
    const out = parseWeeklyThemeResponse(JSON.stringify({ theme: "⚠️ Don't lose your streak" }));
    expect(out).toBeNull();
  });

  it("rejects themes that mention losing a streak", () => {
    const out = parseWeeklyThemeResponse(
      JSON.stringify({ theme: "Don't lose your streak this week" }),
    );
    expect(out).toBeNull();
  });

  it("rejects themes that say 'level up'", () => {
    const out = parseWeeklyThemeResponse(JSON.stringify({ theme: "Level up your data skills" }));
    expect(out).toBeNull();
  });

  it("rejects themes that say 'crush' or 'crush it'", () => {
    expect(
      parseWeeklyThemeResponse(JSON.stringify({ theme: "Crush python comprehensions" })),
    ).toBeNull();
  });

  it("rejects themes that mention leaderboards", () => {
    const out = parseWeeklyThemeResponse(JSON.stringify({ theme: "Climb the leaderboard week" }));
    expect(out).toBeNull();
  });

  it("rejects all-caps imperatives", () => {
    expect(parseWeeklyThemeResponse(JSON.stringify({ theme: "BUILD HASH MAPS" }))).toBeNull();
    expect(parseWeeklyThemeResponse(JSON.stringify({ theme: "LEARN THE LOOPS" }))).toBeNull();
  });

  it("accepts all-caps acronyms in mixed-case context", () => {
    const out = parseWeeklyThemeResponse(JSON.stringify({ theme: "API basics and HTTP" }));
    expect(out).not.toBeNull();
  });
});

describe("generateWeeklyTheme — STORY-046c", () => {
  it("calls Haiku with the v1 prompt version + reflection role + correct user_id", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "Building blocks of declarative Python" })]);
    await generateWeeklyTheme({
      llm,
      user_id: "u-123",
      concepts: [
        { slug: "x", name: "List comprehensions" },
        { slug: "y", name: "Generators" },
        { slug: "z", name: "Dicts" },
      ],
    });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.role).toBe("reflection");
    expect(llm.calls[0]?.model).toMatch(/haiku/);
    expect(llm.calls[0]?.prompt_version).toBe(WEEKLY_THEME_PROMPT_VERSION);
    expect(llm.calls[0]?.user_id).toBe("u-123");
  });

  it("returns the parsed theme on a clean LLM response", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "Shaping data into the right boxes" })]);
    const out = await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "x", name: "Lists" },
        { slug: "y", name: "Dicts" },
        { slug: "z", name: "Sets" },
      ],
    });
    expect(out).not.toBeNull();
    expect(out?.theme).toBe("Shaping data into the right boxes");
  });

  it("passes the concept names + tags through to the user prompt", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "Reading the room with hash maps" })]);
    await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "x", name: "Dicts", tags: ["data-modeling"] },
        { slug: "y", name: "Sets" },
        { slug: "z", name: "Lookups" },
      ],
    });
    const userMessage = llm.calls[0]?.messages[0]?.content ?? "";
    expect(userMessage).toContain("Dicts");
    expect(userMessage).toContain("Sets");
    expect(userMessage).toContain("Lookups");
    expect(userMessage).toContain("tags: data-modeling");
  });

  it("includes target_role when supplied", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "Patterns for backend data" })]);
    await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "x", name: "Lists" },
        { slug: "y", name: "Dicts" },
        { slug: "z", name: "Loops" },
      ],
      target_role: "backend-engineer",
    });
    const userMessage = llm.calls[0]?.messages[0]?.content ?? "";
    expect(userMessage).toContain("backend-engineer");
  });

  it("returns null when concepts list is empty (no LLM call)", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "x" })]);
    const out = await generateWeeklyTheme({
      llm,
      concepts: [],
    });
    expect(out).toBeNull();
    expect(llm.calls).toHaveLength(0);
  });

  it("returns null when LLM throws (caller falls back)", async () => {
    const llm = failingLLM(new Error("transient"));
    const out = await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "x", name: "Lists" },
        { slug: "y", name: "Dicts" },
        { slug: "z", name: "Loops" },
      ],
    });
    expect(out).toBeNull();
  });

  it("returns null when the LLM emits a forbidden phrase (caller falls back)", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "Crush list comprehensions" })]);
    const out = await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "x", name: "Lists" },
        { slug: "y", name: "Dicts" },
        { slug: "z", name: "Loops" },
      ],
    });
    expect(out).toBeNull();
  });

  it("returns null when the LLM emits something too long (caller falls back)", async () => {
    const llm = fakeLLM([
      JSON.stringify({ theme: "one two three four five six seven eight nine ten" }),
    ]);
    const out = await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "x", name: "Lists" },
        { slug: "y", name: "Dicts" },
        { slug: "z", name: "Loops" },
      ],
    });
    expect(out).toBeNull();
  });

  it("respects an explicit model override", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "Patterns and shapes" })]);
    await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "x", name: "Lists" },
        { slug: "y", name: "Dicts" },
        { slug: "z", name: "Loops" },
      ],
      model: "claude-sonnet-4-5",
    });
    expect(llm.calls[0]?.model).toBe("claude-sonnet-4-5");
  });

  it("uses a small max_tokens budget (theme is one short line)", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "Patterns and shapes" })]);
    await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "x", name: "Lists" },
        { slug: "y", name: "Dicts" },
        { slug: "z", name: "Loops" },
      ],
    });
    expect(llm.calls[0]?.max_tokens).toBeLessThanOrEqual(200);
  });

  it("does not include user_id when caller omits it", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "Loops and lists" })]);
    await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "x", name: "Lists" },
        { slug: "y", name: "Dicts" },
        { slug: "z", name: "Loops" },
      ],
    });
    expect(llm.calls[0]?.user_id).toBeUndefined();
  });
});

describe("generateWeeklyTheme — fixture-based generated theme tests", () => {
  // STORY-046c AC: a fixture-based generated-theme test. We mock the LLM with realistic-ish
  // theme strings the model might emit and assert the wrapper round-trips cleanly. These
  // are golden examples — if a future prompt edit produces a regression, this catches it.
  const FIXTURES: Array<{ name: string; concepts: Array<{ name: string }>; emit: string }> = [
    {
      name: "list-comprehensions + generators",
      concepts: [{ name: "List comprehensions" }, { name: "Generators" }, { name: "Iterators" }],
      emit: "Building blocks of declarative Python",
    },
    {
      name: "dicts + sets + lookups",
      concepts: [{ name: "Dicts" }, { name: "Sets" }, { name: "Lookups" }],
      emit: "Reading the room with hash maps",
    },
    {
      name: "tuples + named-tuples + dataclasses",
      concepts: [{ name: "Tuples" }, { name: "Named tuples" }, { name: "Dataclasses" }],
      emit: "Shaping data into the right boxes",
    },
    {
      name: "loops + lists + comprehensions",
      concepts: [{ name: "Loops" }, { name: "Lists" }, { name: "Comprehensions" }],
      emit: "Loops, lists, and the rhythm between",
    },
  ];

  for (const fix of FIXTURES) {
    it(`accepts the fixture theme for "${fix.name}"`, async () => {
      const llm = fakeLLM([JSON.stringify({ theme: fix.emit })]);
      const out = await generateWeeklyTheme({
        llm,
        concepts: fix.concepts.map((c, i) => ({ slug: `s-${i}`, name: c.name })),
      });
      expect(out).not.toBeNull();
      expect(out?.theme).toBe(fix.emit);
    });
  }

  it("rejects a fixture containing the fire emoji", async () => {
    const llm = fakeLLM([JSON.stringify({ theme: "🔥 Lists week" })]);
    const out = await generateWeeklyTheme({
      llm,
      concepts: [
        { slug: "a", name: "Lists" },
        { slug: "b", name: "Dicts" },
        { slug: "c", name: "Sets" },
      ],
    });
    expect(out).toBeNull();
  });
});

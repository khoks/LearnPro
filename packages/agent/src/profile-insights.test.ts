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
import type { ProfileInsightsEpisodeShape } from "@learnpro/prompts";
import {
  MIN_EPISODES_FOR_SYNTHESIS,
  containsForbiddenPhrase,
  parseInsightsResponse,
  runProfileInsightsAgent,
} from "./profile-insights.js";

// STORY-033 — Tests cover:
//   - parseInsightsResponse handles fenced + bare json + mangled output
//   - containsForbiddenPhrase catches every accusatory term
//   - runProfileInsightsAgent short-circuits thin data
//   - runProfileInsightsAgent strips invented concept tags + hallucinated episode ids
//   - runProfileInsightsAgent caps the result at 3 insights
//   - runProfileInsightsAgent returns fallback_used=true on parse failure
//   - the LLM call is configured with the right role/model/prompt_version

class FakeLLM implements LLMProvider {
  readonly name = "fake";
  lastRequest: CompleteRequest | null = null;
  responseText: string;

  constructor(responseText: string) {
    this.responseText = responseText;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    this.lastRequest = req;
    return {
      text: this.responseText,
      model: req.model ?? "fake-model",
      finish_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    };
  }

  stream(_req: CompleteRequest): AsyncIterable<StreamChunk> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ value: undefined, done: true }),
      }),
    };
  }
  async embed(_req: EmbedRequest): Promise<EmbedResponse> {
    return { vector: [0], model: "fake", usage: {} };
  }
  async toolCall(_req: ToolCallRequest): Promise<ToolCallResponse> {
    return { invocations: [], usage: { input_tokens: 0, output_tokens: 0 } };
  }
}

const SAMPLE_EPISODES: ProfileInsightsEpisodeShape[] = [
  {
    episode_id: "11111111-1111-4111-8111-111111111111",
    problem_slug: "two-sum",
    problem_name: "Two Sum",
    problem_language: "python",
    concept_tags: ["arrays", "hash-tables"],
    final_outcome: "passed_with_hints",
    hints_used: 2,
    attempts: 3,
    time_to_solve_ms: 180_000,
  },
  {
    episode_id: "22222222-2222-4222-8222-222222222222",
    problem_slug: "valid-parens",
    problem_name: "Valid Parens",
    problem_language: "python",
    concept_tags: ["stacks", "edge-cases"],
    final_outcome: "failed",
    hints_used: 0,
    attempts: 4,
    time_to_solve_ms: 600_000,
  },
  {
    episode_id: "33333333-3333-4333-8333-333333333333",
    problem_slug: "reverse-string",
    problem_name: "Reverse String",
    problem_language: "python",
    concept_tags: ["strings", "edge-cases"],
    final_outcome: "passed",
    hints_used: 0,
    attempts: 1,
    time_to_solve_ms: 60_000,
  },
];

describe("parseInsightsResponse — STORY-033", () => {
  it("parses a clean JSON object with the expected wrapper", () => {
    const r = parseInsightsResponse(
      JSON.stringify({
        insights: [
          {
            text: "user reaches for `for` when comprehensions would be cleaner",
            concept_tags: ["loops"],
            episodes_referenced: ["11111111-1111-4111-8111-111111111111"],
          },
        ],
      }),
    );
    expect(r).not.toBeNull();
    expect(r?.insights).toHaveLength(1);
    expect(r?.insights[0]?.text).toContain("comprehensions");
  });

  it("strips ```json fences before parsing", () => {
    const r = parseInsightsResponse(
      "```json\n" + JSON.stringify({ insights: [] }) + "\n```",
    );
    expect(r).not.toBeNull();
    expect(r?.insights).toEqual([]);
  });

  it("returns null on garbage input", () => {
    expect(parseInsightsResponse("not json at all")).toBeNull();
  });

  it("returns null on a bare array (model flattened the wrapper)", () => {
    expect(parseInsightsResponse("[]")).toBeNull();
  });

  it("returns null when an insight is missing required fields", () => {
    const r = parseInsightsResponse(
      JSON.stringify({ insights: [{ concept_tags: ["x"] }] }),
    );
    expect(r).toBeNull();
  });
});

describe("containsForbiddenPhrase — STORY-033", () => {
  it("catches accusatory framing", () => {
    expect(containsForbiddenPhrase("you struggle with recursion")).toBe(true);
    expect(containsForbiddenPhrase("YOU FAIL on edge cases")).toBe(true);
    expect(containsForbiddenPhrase("they were lazy on this one")).toBe(true);
  });

  it("catches loss-aversion phrases", () => {
    expect(containsForbiddenPhrase("don't lose your streak")).toBe(true);
    expect(containsForbiddenPhrase("they fall behind on patterns")).toBe(true);
  });

  it("catches honesty-shaming phrases", () => {
    expect(containsForbiddenPhrase("they cheat on hard ones")).toBe(true);
    expect(containsForbiddenPhrase("dishonest about hint usage")).toBe(true);
  });

  it("returns false on clean observation phrasing", () => {
    expect(
      containsForbiddenPhrase("the learner reaches for `for` when comprehensions would be cleaner"),
    ).toBe(false);
    expect(
      containsForbiddenPhrase("mutability boundaries trip the learner across multiple problems"),
    ).toBe(false);
  });
});

describe("runProfileInsightsAgent — STORY-033", () => {
  it("short-circuits when the window is too thin (no LLM call)", async () => {
    const llm = new FakeLLM("");
    const out = await runProfileInsightsAgent({
      llm,
      user_id: "u1",
      recent_episodes: SAMPLE_EPISODES.slice(0, MIN_EPISODES_FOR_SYNTHESIS - 1),
    });
    expect(out.skipped_thin_data).toBe(true);
    expect(out.insights).toEqual([]);
    expect(out.fallback_used).toBe(false);
    expect(llm.lastRequest).toBeNull();
  });

  it("calls the LLM with reflection role + Haiku-by-default + the v1 prompt version", async () => {
    const llm = new FakeLLM(JSON.stringify({ insights: [] }));
    await runProfileInsightsAgent({
      llm,
      user_id: "u1",
      recent_episodes: SAMPLE_EPISODES,
    });
    expect(llm.lastRequest).not.toBeNull();
    expect(llm.lastRequest?.role).toBe("reflection");
    expect(llm.lastRequest?.prompt_version).toBe("profile-insights-v1");
    expect(llm.lastRequest?.user_id).toBe("u1");
    // Should default to Haiku — string match avoids importing the constant in the test.
    expect(llm.lastRequest?.model).toContain("haiku");
  });

  it("returns the parsed insights when the LLM emits valid JSON", async () => {
    const llm = new FakeLLM(
      JSON.stringify({
        insights: [
          {
            text: "Across two episodes the learner reaches for `for` when comprehensions would be cleaner.",
            concept_tags: ["arrays"],
            episodes_referenced: ["11111111-1111-4111-8111-111111111111"],
          },
        ],
      }),
    );
    const out = await runProfileInsightsAgent({
      llm,
      user_id: "u1",
      recent_episodes: SAMPLE_EPISODES,
    });
    expect(out.fallback_used).toBe(false);
    expect(out.insights).toHaveLength(1);
    expect(out.insights[0]?.text).toContain("comprehensions");
    expect(out.insights[0]?.concept_tags).toEqual(["arrays"]);
    expect(out.insights[0]?.episodes_referenced).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("strips concept tags the model invented (not in any input episode)", async () => {
    const llm = new FakeLLM(
      JSON.stringify({
        insights: [
          {
            text: "The learner consistently warms up on the easier half before pushing.",
            concept_tags: ["arrays", "made-up-tag", "stacks"],
            episodes_referenced: [],
          },
        ],
      }),
    );
    const out = await runProfileInsightsAgent({
      llm,
      user_id: "u1",
      recent_episodes: SAMPLE_EPISODES,
    });
    expect(out.insights[0]?.concept_tags).toEqual(["arrays", "stacks"]);
  });

  it("strips episode_ids the model hallucinated", async () => {
    const llm = new FakeLLM(
      JSON.stringify({
        insights: [
          {
            text: "Consistent edge-case attempts across two stack problems.",
            concept_tags: ["stacks"],
            episodes_referenced: [
              "11111111-1111-4111-8111-111111111111",
              "deadbeef-dead-4dad-8dad-deaddeaddead",
            ],
          },
        ],
      }),
    );
    const out = await runProfileInsightsAgent({
      llm,
      user_id: "u1",
      recent_episodes: SAMPLE_EPISODES,
    });
    expect(out.insights[0]?.episodes_referenced).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("filters out insights containing forbidden phrases", async () => {
    const llm = new FakeLLM(
      JSON.stringify({
        insights: [
          {
            text: "you struggle with recursion across the board",
            concept_tags: [],
            episodes_referenced: [],
          },
          {
            text: "the learner is consistently warm-up first, push second",
            concept_tags: [],
            episodes_referenced: [],
          },
        ],
      }),
    );
    const out = await runProfileInsightsAgent({
      llm,
      user_id: "u1",
      recent_episodes: SAMPLE_EPISODES,
    });
    expect(out.insights).toHaveLength(1);
    expect(out.insights[0]?.text).toContain("warm-up");
    expect(out.filtered_out).toBe(1);
  });

  it("caps the result at 3 insights even if the model emits more", async () => {
    const llm = new FakeLLM(
      JSON.stringify({
        insights: [
          { text: "obs 1", concept_tags: [], episodes_referenced: [] },
          { text: "obs 2", concept_tags: [], episodes_referenced: [] },
          { text: "obs 3", concept_tags: [], episodes_referenced: [] },
          { text: "obs 4", concept_tags: [], episodes_referenced: [] },
          { text: "obs 5", concept_tags: [], episodes_referenced: [] },
        ],
      }),
    );
    const out = await runProfileInsightsAgent({
      llm,
      user_id: "u1",
      recent_episodes: SAMPLE_EPISODES,
    });
    expect(out.insights).toHaveLength(3);
  });

  it("falls back to an empty list with fallback_used=true on unparseable output", async () => {
    const llm = new FakeLLM("not json at all");
    const out = await runProfileInsightsAgent({
      llm,
      user_id: "u1",
      recent_episodes: SAMPLE_EPISODES,
    });
    expect(out.fallback_used).toBe(true);
    expect(out.insights).toEqual([]);
  });
});

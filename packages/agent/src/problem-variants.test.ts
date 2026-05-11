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
import {
  ImplementProblemDefSchema,
  ProblemDefSchema,
  type ImplementProblemDef,
} from "@learnpro/problems";
import {
  PROBLEM_VARIANTS_PROMPT_VERSION,
  buildProblemVariantsSystemPrompt,
  buildProblemVariantsUserPrompt,
} from "@learnpro/prompts";
import {
  streamChunksFromRun,
  type SandboxProvider,
  type SandboxRunChunk,
  type SandboxRunRequest,
  type SandboxRunRequestInput,
  type SandboxRunResponse,
} from "@learnpro/sandbox";
import {
  generateProblemVariant,
  parseProblemVariantResponse,
  type ProblemVariantsTelemetry,
} from "./problem-variants.js";

// STORY-039 — tests cover:
//   - The `variant_of` field validates correctly through ProblemDefSchema
//   - Pure function happy path: mocked LLM returns parseable variant
//   - Self-validation rejection: invalid LLM output → empty result
//   - Drift detection: variant with mismatched language/difficulty/tags is rejected
//   - Slug pattern enforcement
//   - Retry on parse failure
//   - Forbidden-phrase test on the system prompt itself

const SOURCE_PROBLEM: ImplementProblemDef = ImplementProblemDefSchema.parse({
  kind: "implement",
  slug: "sum-even-numbers",
  name: "Sum of even numbers",
  language: "python",
  difficulty: 2,
  track: "python-fundamentals",
  concept_tags: ["loops", "arithmetic"],
  statement: "Given a list of integers, return the sum of all even numbers.",
  starter_code: "def solve(nums):\n    pass\n",
  reference_solution: "def solve(nums):\n    return sum(n for n in nums if n % 2 == 0)\n",
  public_examples: [{ input: [1, 2, 3, 4], expected: 6 }],
  hidden_tests: [
    { input: [], expected: 0 },
    { input: [2, 4, 6], expected: 12 },
    { input: [1, 3, 5], expected: 0 },
  ],
  expected_median_time_to_solve_ms: 60_000,
});

function validVariantPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "implement",
    slug: "sum-even-numbers-variant-1",
    name: "Product of odd numbers",
    language: "python",
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["loops", "arithmetic"],
    statement:
      "Given a list of integers, return the product of all odd numbers in the list. If there are no odd numbers, return 1.",
    starter_code: "def solve(nums):\n    pass\n",
    reference_solution:
      "def solve(nums):\n    result = 1\n    for n in nums:\n        if n % 2 != 0:\n            result *= n\n    return result\n",
    public_examples: [{ input: [1, 2, 3, 4, 5], expected: 15 }],
    hidden_tests: [
      { input: [], expected: 1 },
      { input: [2, 4, 6], expected: 1 },
      { input: [1, 3, 5, 7], expected: 105 },
    ],
    expected_median_time_to_solve_ms: 60_000,
    variant_of: "sum-even-numbers",
    ...overrides,
  };
}

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

describe("ProblemDefSchema — variant_of field — STORY-039", () => {
  it("accepts a valid implement problem with variant_of", () => {
    const result = ProblemDefSchema.safeParse(validVariantPayload());
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "implement") {
      expect(result.data.variant_of).toBe("sum-even-numbers");
    }
  });

  it("accepts an implement problem WITHOUT variant_of (legacy YAMLs)", () => {
    const payload = validVariantPayload();
    delete payload.variant_of;
    const result = ProblemDefSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "implement") {
      expect(result.data.variant_of).toBeUndefined();
    }
  });

  it("rejects variant_of that is not a kebab-case slug", () => {
    const result = ProblemDefSchema.safeParse(validVariantPayload({ variant_of: "INVALID Slug" }));
    expect(result.success).toBe(false);
  });

  it("rejects empty-string variant_of", () => {
    const result = ProblemDefSchema.safeParse(validVariantPayload({ variant_of: "" }));
    expect(result.success).toBe(false);
  });
});

describe("parseProblemVariantResponse — STORY-039", () => {
  it("parses a clean JSON variant", () => {
    const text = JSON.stringify(validVariantPayload());
    const out = parseProblemVariantResponse(text, SOURCE_PROBLEM);
    expect(out).not.toBeNull();
    expect(out?.slug).toBe("sum-even-numbers-variant-1");
    expect(out?.kind).toBe("implement");
  });

  it("strips ```json fences before parsing", () => {
    const text = "```json\n" + JSON.stringify(validVariantPayload()) + "\n```";
    const out = parseProblemVariantResponse(text, SOURCE_PROBLEM);
    expect(out).not.toBeNull();
  });

  it("returns null on garbage", () => {
    expect(parseProblemVariantResponse("not json", SOURCE_PROBLEM)).toBeNull();
    expect(parseProblemVariantResponse("", SOURCE_PROBLEM)).toBeNull();
  });

  it("returns null when the variant fails Zod (missing field)", () => {
    const broken = validVariantPayload();
    delete broken.hidden_tests;
    const out = parseProblemVariantResponse(JSON.stringify(broken), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes language", () => {
    const drifted = validVariantPayload({ language: "typescript" });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes difficulty", () => {
    const drifted = validVariantPayload({ difficulty: 4 });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes concept_tags", () => {
    const drifted = validVariantPayload({ concept_tags: ["loops", "strings"] });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes the track", () => {
    const drifted = validVariantPayload({ track: "typescript-fundamentals" });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes kind to debug", () => {
    const drifted = validVariantPayload({
      kind: "debug",
      bug_archetype: "off_by_one",
      expected_behavior: "Should sum.",
    });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the slug doesn't follow the source-prefix pattern", () => {
    const drifted = validVariantPayload({ slug: "unrelated-problem" });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when variant_of points to a different source", () => {
    const drifted = validVariantPayload({ variant_of: "other-problem" });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("accepts a variant that omits variant_of (the slug-prefix check is enough)", () => {
    const ok = validVariantPayload();
    delete ok.variant_of;
    const out = parseProblemVariantResponse(JSON.stringify(ok), SOURCE_PROBLEM);
    expect(out).not.toBeNull();
  });
});

describe("generateProblemVariant — STORY-039", () => {
  it("calls Haiku with the v1 prompt version + reflection role + correct user_id", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    await generateProblemVariant({
      llm,
      user_id: "u-123",
      source: SOURCE_PROBLEM,
    });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.role).toBe("reflection");
    expect(llm.calls[0]?.model).toMatch(/haiku/);
    expect(llm.calls[0]?.prompt_version).toBe(PROBLEM_VARIANTS_PROMPT_VERSION);
    expect(llm.calls[0]?.user_id).toBe("u-123");
  });

  it("happy path: returns a parsed variant when the LLM emits valid JSON", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
    });
    expect(out.fallback_used).toBe(false);
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0]?.slug).toBe("sum-even-numbers-variant-1");
  });

  it("retries once on parse failure, succeeds on the second attempt", async () => {
    const llm = fakeLLM([
      "not json",
      JSON.stringify(validVariantPayload({ slug: "sum-even-numbers-variant-2" })),
    ]);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
    });
    expect(llm.calls).toHaveLength(2);
    expect(out.variants).toHaveLength(1);
    expect(out.fallback_used).toBe(false);
  });

  it("returns empty + fallback_used=true when both attempts fail", async () => {
    const llm = fakeLLM(["not json", "still not json"]);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
    });
    expect(llm.calls).toHaveLength(2);
    expect(out.variants).toEqual([]);
    expect(out.fallback_used).toBe(true);
  });

  it("returns empty when the LLM returns a schema-failing variant on every attempt", async () => {
    const broken = validVariantPayload();
    delete broken.hidden_tests;
    const llm = fakeLLM([JSON.stringify(broken), JSON.stringify(broken)]);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
    });
    expect(out.variants).toEqual([]);
    expect(out.fallback_used).toBe(true);
  });

  it("returns empty when the source isn't an implement problem (defensive guard)", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    // Cast a shape that isn't an implement problem — comprehension/debug not supported in v1.
    const fakeSource = {
      ...SOURCE_PROBLEM,
      kind: "comprehension" as const,
    } as unknown as ImplementProblemDef;
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: fakeSource,
    });
    expect(llm.calls).toHaveLength(0);
    expect(out.variants).toEqual([]);
    expect(out.fallback_used).toBe(true);
  });

  it("respects an explicit model override", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      model: "claude-sonnet-4-5",
    });
    expect(llm.calls[0]?.model).toBe("claude-sonnet-4-5");
  });

  it("clamps count > 5 down to 5", async () => {
    // Each call returns the same variant payload with a unique slug so the dedupe doesn't
    // suppress them.
    const responses: string[] = [];
    for (let i = 1; i <= 8; i++) {
      responses.push(
        JSON.stringify(validVariantPayload({ slug: `sum-even-numbers-variant-${i}` })),
      );
    }
    const llm = fakeLLM(responses);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      count: 99,
    });
    // Each successful generate consumes one call; clamping to 5 means at most 5 successful
    // outputs (and at most 10 calls if every first attempt parsed cleanly — here they do).
    expect(out.variants.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================================
// STORY-039a — Piston self-validation gate. The agent now optionally accepts a
// SandboxProvider; when wired, every parsed variant must pass `validateProblem`
// against its own hidden_tests before being returned. Failure → augmented retry
// → on second failure, drop. Telemetry counters fire for each phase.
// ============================================================================

class StubPassingSandbox implements SandboxProvider {
  readonly name = "stub-pass";
  readonly calls: SandboxRunRequestInput[] = [];

  async run(req: SandboxRunRequestInput): Promise<SandboxRunResponse> {
    this.calls.push(req);
    return Promise.resolve({
      stdout: "__LEARNPRO_PASS__\n",
      stderr: "",
      exit_code: 0,
      duration_ms: 5,
      killed_by: null,
      language: req.language,
    });
  }

  runStream(req: SandboxRunRequest, signal?: AbortSignal): AsyncIterable<SandboxRunChunk> {
    return streamChunksFromRun(() => this.run(req), signal);
  }
}

class StubFailingSandbox implements SandboxProvider {
  readonly name = "stub-fail";
  readonly calls: SandboxRunRequestInput[] = [];

  async run(req: SandboxRunRequestInput): Promise<SandboxRunResponse> {
    this.calls.push(req);
    return Promise.resolve({
      stdout: "__LEARNPRO_FAIL__" + JSON.stringify({ detail: "expected 1, got 0", got: 0 }) + "\n",
      stderr: "",
      exit_code: 0,
      duration_ms: 5,
      killed_by: null,
      language: req.language,
    });
  }

  runStream(req: SandboxRunRequest, signal?: AbortSignal): AsyncIterable<SandboxRunChunk> {
    return streamChunksFromRun(() => this.run(req), signal);
  }
}

class StubFailThenPassSandbox implements SandboxProvider {
  readonly name = "stub-fail-then-pass";
  // The first variant's set of hidden-test runs all fail; subsequent variant runs all pass.
  readonly calls: SandboxRunRequestInput[] = [];
  private firstSlug: string | null = null;

  async run(req: SandboxRunRequestInput): Promise<SandboxRunResponse> {
    this.calls.push(req);
    // Use the harness `code` (or first multi-file content) as the failure-mode anchor — the
    // first slug seen always fails; later slugs pass.
    const code =
      "code" in req && typeof req.code === "string"
        ? req.code
        : "files" in req && req.files && req.files[0]
          ? req.files[0].content
          : "";
    if (this.firstSlug === null) this.firstSlug = code;
    const stdout =
      code === this.firstSlug
        ? "__LEARNPRO_FAIL__" + JSON.stringify({ detail: "wrong answer", got: 0 }) + "\n"
        : "__LEARNPRO_PASS__\n";
    return Promise.resolve({
      stdout,
      stderr: "",
      exit_code: 0,
      duration_ms: 5,
      killed_by: null,
      language: req.language,
    });
  }

  runStream(req: SandboxRunRequest, signal?: AbortSignal): AsyncIterable<SandboxRunChunk> {
    return streamChunksFromRun(() => this.run(req), signal);
  }
}

class ThrowingSandbox implements SandboxProvider {
  readonly name = "throwing";
  async run(): Promise<SandboxRunResponse> {
    throw new Error("simulated sandbox outage");
  }
  runStream(req: SandboxRunRequest, signal?: AbortSignal): AsyncIterable<SandboxRunChunk> {
    return streamChunksFromRun(() => this.run(), signal);
  }
}

function recordingTelemetry(): {
  events: Array<{ kind: string; slug: string; attempt: number }>;
  cb: ProblemVariantsTelemetry;
} {
  const events: Array<{ kind: string; slug: string; attempt: number }> = [];
  const cb: ProblemVariantsTelemetry = {
    variants_generated: (e) => events.push({ kind: "generated", slug: e.slug, attempt: e.attempt }),
    variants_validated_pass: (e) =>
      events.push({ kind: "validated_pass", slug: e.slug, attempt: e.attempt }),
    variants_dropped_fail: (e) =>
      events.push({ kind: "dropped_fail", slug: e.slug, attempt: e.attempt }),
  };
  return { events, cb };
}

describe("generateProblemVariant — STORY-039a self-validation gate", () => {
  it("happy path: passing sandbox + valid variant → returns variant + emits validated_pass", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    const sandbox = new StubPassingSandbox();
    const { events, cb } = recordingTelemetry();
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      sandbox,
      onTelemetry: cb,
    });
    expect(out.variants).toHaveLength(1);
    expect(out.fallback_used).toBe(false);
    // 3 hidden_tests in the valid variant payload → 3 sandbox calls.
    expect(sandbox.calls.length).toBe(3);
    expect(events).toEqual([
      { kind: "generated", slug: "sum-even-numbers-variant-1", attempt: 1 },
      { kind: "validated_pass", slug: "sum-even-numbers-variant-1", attempt: 1 },
    ]);
  });

  it("validator fails on attempt #1, passes on #2 → returns the second variant + retry telemetry", async () => {
    const llm = fakeLLM([
      JSON.stringify(validVariantPayload({ slug: "sum-even-numbers-variant-1" })),
      JSON.stringify(
        validVariantPayload({
          slug: "sum-even-numbers-variant-2",
          // Different reference_solution so the harness output differs from variant-1; the stub
          // sandbox keys "firstSlug" off the rendered code, so variant-2's code must not match.
          reference_solution:
            "def solve(nums):\n    out = 1\n    for n in nums:\n        if n & 1:\n            out *= n\n    return out\n",
        }),
      ),
    ]);
    const sandbox = new StubFailThenPassSandbox();
    const { events, cb } = recordingTelemetry();
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      sandbox,
      onTelemetry: cb,
    });
    expect(llm.calls).toHaveLength(2);
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0]?.slug).toBe("sum-even-numbers-variant-2");
    expect(out.fallback_used).toBe(false);
    expect(events.map((e) => e.kind)).toEqual([
      "generated",
      "dropped_fail",
      "generated",
      "validated_pass",
    ]);
  });

  it("retry call carries an augmented prompt referencing the previous failure", async () => {
    const llm = fakeLLM([
      JSON.stringify(validVariantPayload({ slug: "sum-even-numbers-variant-1" })),
      JSON.stringify(validVariantPayload({ slug: "sum-even-numbers-variant-2" })),
    ]);
    const sandbox = new StubFailThenPassSandbox();
    await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      sandbox,
    });
    expect(llm.calls).toHaveLength(2);
    const secondMessage = llm.calls[1]?.messages[0]?.content ?? "";
    expect(secondMessage).toContain("did not pass its own hidden_tests");
    expect(secondMessage).toContain("sum-even-numbers-variant-1");
    expect(secondMessage).toContain("Previous reference_solution");
  });

  it("validator fails on both attempts → returns empty + emits two dropped_fail counters", async () => {
    const llm = fakeLLM([
      JSON.stringify(validVariantPayload({ slug: "sum-even-numbers-variant-1" })),
      JSON.stringify(validVariantPayload({ slug: "sum-even-numbers-variant-2" })),
    ]);
    const sandbox = new StubFailingSandbox();
    const { events, cb } = recordingTelemetry();
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      sandbox,
      onTelemetry: cb,
    });
    expect(out.variants).toEqual([]);
    expect(out.fallback_used).toBe(true);
    expect(events.filter((e) => e.kind === "dropped_fail")).toHaveLength(2);
    expect(events.filter((e) => e.kind === "validated_pass")).toHaveLength(0);
  });

  it("sandbox throws → treated as validation failure (does not crash the agent)", async () => {
    const llm = fakeLLM([
      JSON.stringify(validVariantPayload({ slug: "sum-even-numbers-variant-1" })),
      JSON.stringify(validVariantPayload({ slug: "sum-even-numbers-variant-2" })),
    ]);
    const { events, cb } = recordingTelemetry();
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      sandbox: new ThrowingSandbox(),
      onTelemetry: cb,
    });
    expect(out.variants).toEqual([]);
    expect(out.fallback_used).toBe(true);
    expect(events.filter((e) => e.kind === "dropped_fail").length).toBeGreaterThan(0);
  });

  it("no sandbox wired → behaves as STORY-039 (no validation, validated_pass still emits)", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    const { events, cb } = recordingTelemetry();
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      onTelemetry: cb,
    });
    expect(out.variants).toHaveLength(1);
    expect(out.fallback_used).toBe(false);
    expect(events).toEqual([
      { kind: "generated", slug: "sum-even-numbers-variant-1", attempt: 1 },
      { kind: "validated_pass", slug: "sum-even-numbers-variant-1", attempt: 1 },
    ]);
  });

  it("a throwing telemetry sink does not block variant generation", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      sandbox: new StubPassingSandbox(),
      onTelemetry: {
        variants_generated: () => {
          throw new Error("sink boom");
        },
        variants_validated_pass: () => {
          throw new Error("sink boom");
        },
      },
    });
    expect(out.variants).toHaveLength(1);
  });

  it("propagates an explicit validation_time_limit_ms through to validateProblem", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    const sandbox = new StubPassingSandbox();
    await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      sandbox,
      validation_time_limit_ms: 1234,
    });
    // validateProblem reads `time_limit_ms` straight off the request envelope.
    for (const call of sandbox.calls) {
      expect(call.time_limit_ms).toBe(1234);
    }
  });

  it("retry skips when the source isn't an implement problem (defensive guard)", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    const sandbox = new StubFailingSandbox();
    const fakeSource = {
      ...SOURCE_PROBLEM,
      kind: "comprehension" as const,
    } as unknown as ImplementProblemDef;
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: fakeSource,
      sandbox,
    });
    expect(llm.calls).toHaveLength(0);
    expect(sandbox.calls).toHaveLength(0);
    expect(out.variants).toEqual([]);
  });
});

describe("problem-variants prompt — STORY-039 forbidden-phrase test", () => {
  // Coach-voice rules: no FOMO / loss-aversion / streak-shaming / coercive copy in the
  // user-facing variant statement. The system prompt sets the register; the test guards
  // against drift if the prompt is later edited.
  const FORBIDDEN_SUBSTRINGS = [
    "DON'T LOSE",
    "LOSE YOUR STREAK",
    "🔥",
    "⚠️",
    "fall behind",
    "leaderboard",
    "you've got this",
    "level up",
    "fomo",
  ];

  it("system prompt has no forbidden coach-voice phrases", () => {
    const sys = buildProblemVariantsSystemPrompt().toLowerCase();
    for (const phrase of FORBIDDEN_SUBSTRINGS) {
      expect(sys.includes(phrase.toLowerCase()), `system prompt contains "${phrase}"`).toBe(false);
    }
  });

  it("system prompt explicitly forbids motivational filler", () => {
    const sys = buildProblemVariantsSystemPrompt().toLowerCase();
    expect(sys).toContain("no motivational filler");
  });

  it("user prompt for a real source is non-empty and references the source slug", () => {
    const userPrompt = buildProblemVariantsUserPrompt({
      source: {
        slug: SOURCE_PROBLEM.slug,
        name: SOURCE_PROBLEM.name,
        language: SOURCE_PROBLEM.language,
        difficulty: SOURCE_PROBLEM.difficulty,
        track: SOURCE_PROBLEM.track,
        concept_tags: SOURCE_PROBLEM.concept_tags,
        statement: SOURCE_PROBLEM.statement,
        starter_code: SOURCE_PROBLEM.starter_code,
        reference_solution: SOURCE_PROBLEM.reference_solution,
        public_examples: SOURCE_PROBLEM.public_examples,
        hidden_tests: SOURCE_PROBLEM.hidden_tests,
        expected_median_time_to_solve_ms: SOURCE_PROBLEM.expected_median_time_to_solve_ms,
      },
      variant_index: 1,
    });
    expect(userPrompt).toContain(SOURCE_PROBLEM.slug);
    expect(userPrompt).toContain("variant-1");
  });
});

// ============================================================================
// STORY-039a integration test — gated by `LEARNPRO_REQUIRE_PISTON=1`. Drives the
// real Piston-on-Docker sandbox to confirm the self-validation path works end-
// to-end against the same hardened sandbox the rest of the platform uses.
// ============================================================================

const REQUIRE_PISTON = process.env["LEARNPRO_REQUIRE_PISTON"] === "1";
const PISTON_URL = process.env["PISTON_URL"] ?? "http://localhost:2000";

describe.skipIf(!REQUIRE_PISTON)(
  "generateProblemVariant — STORY-039a Piston integration (LEARNPRO_REQUIRE_PISTON=1)",
  () => {
    it("a structurally valid variant whose reference_solution actually solves its hidden_tests passes self-validation", async () => {
      // Lazy-require so the import path doesn't load when the integration suite is skipped.
      const { PistonHttpTransport, PistonSandboxProvider } = await import("@learnpro/sandbox");
      const provider = new PistonSandboxProvider({
        transport: new PistonHttpTransport({ baseUrl: PISTON_URL }),
      });
      const correctVariant = JSON.stringify(validVariantPayload());
      const llm = fakeLLM([correctVariant]);
      const out = await generateProblemVariant({
        llm,
        user_id: "u",
        source: SOURCE_PROBLEM,
        sandbox: provider,
        validation_time_limit_ms: 8_000,
      });
      expect(out.variants).toHaveLength(1);
      expect(out.fallback_used).toBe(false);
    }, 60_000);
  },
);

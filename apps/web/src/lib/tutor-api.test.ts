import { describe, expect, it, vi } from "vitest";
import { assignEpisode, finishEpisode, requestHint, submitCode } from "./tutor-api";

const TRACK_ID = "11111111-1111-4111-8111-111111111111";
const EPISODE_ID = "22222222-2222-4222-8222-222222222222";

describe("tutor-api", () => {
  it("assignEpisode posts to /api/tutor/episodes and returns the parsed body", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ episode_id: EPISODE_ID, problem_slug: "two-sum" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await assignEpisode({ track_id: TRACK_ID }, { fetchImpl: fakeFetch });
    expect(r.ok).toBe(true);
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/tutor/episodes",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requestHint posts to the [id] route and round-trips xp_cost", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ rung: 1, hint: "Think.", xp_cost: 5 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await requestHint(EPISODE_ID, 1, { fetchImpl: fakeFetch });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.xp_cost).toBe(5);
    expect(fakeFetch).toHaveBeenCalledWith(
      `/api/tutor/episodes/${EPISODE_ID}/hint`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("submitCode posts to the submit route", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ passed: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await submitCode(EPISODE_ID, "x = 1", { fetchImpl: fakeFetch });
    expect(r.ok).toBe(true);
    expect(fakeFetch).toHaveBeenCalledWith(
      `/api/tutor/episodes/${EPISODE_ID}/submit`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "x = 1" }) }),
    );
  });

  it("finishEpisode allows an empty body", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ episode_id: EPISODE_ID, final_outcome: "passed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await finishEpisode(EPISODE_ID, {}, { fetchImpl: fakeFetch });
    expect(r.ok).toBe(true);
    expect(fakeFetch).toHaveBeenCalledWith(
      `/api/tutor/episodes/${EPISODE_ID}/finish`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
    );
  });

  it("returns a SessionError on non-2xx with the upstream code/message", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "daily_budget_exceeded", message: "out of tokens" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await assignEpisode({ track_id: TRACK_ID }, { fetchImpl: fakeFetch });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.status).toBe(429);
      expect(r.error.code).toBe("daily_budget_exceeded");
      expect(r.error.message).toBe("out of tokens");
    }
  });

  it("returns a SessionError when fetch throws", async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error("boom"));
    const r = await assignEpisode({ track_id: TRACK_ID }, { fetchImpl: fakeFetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("network_error");
  });
});

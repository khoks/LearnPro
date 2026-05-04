import type {
  AssignProblemOutput,
  GiveHintOutput,
  GradeOutput,
  HintRung,
  UpdateProfileOutput,
  FinalOutcome,
} from "@learnpro/agent";
import { friendlyError, type SessionError } from "./session-state";

// Browser-side wrappers around the 4 Next.js tutor proxies. Each returns a discriminated-union
// result the SessionClient reducer can dispatch on directly. Errors are coerced to SessionError
// (never thrown) so the component never has to wrap calls in try/catch.

export interface TutorOk<T> {
  ok: true;
  data: T;
}

export interface TutorErr {
  ok: false;
  error: SessionError;
}

export type TutorResult<T> = TutorOk<T> | TutorErr;

export interface TutorApiOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function postJson<T>(url: string, body: unknown, opts: TutorApiOptions): Promise<TutorResult<T>> {
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    return {
      ok: false,
      error: friendlyError(0, {
        error: "network_error",
        message: err instanceof Error ? err.message : String(err),
      }),
    };
  }

  const json = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    const errBody = parseErrorEnvelope(json);
    return { ok: false, error: friendlyError(res.status, errBody) };
  }

  return { ok: true, data: json as T };
}

function parseErrorEnvelope(raw: unknown): { error?: string; message?: string } {
  if (!raw || typeof raw !== "object") return {};
  const out: { error?: string; message?: string } = {};
  const r = raw as Record<string, unknown>;
  if (typeof r["error"] === "string") out.error = r["error"];
  if (typeof r["message"] === "string") out.message = r["message"];
  return out;
}

export function assignEpisode(
  body: { track_id: string },
  opts: TutorApiOptions = {},
): Promise<TutorResult<AssignProblemOutput>> {
  return postJson<AssignProblemOutput>("/api/tutor/episodes", body, opts);
}

export function requestHint(
  episode_id: string,
  rung: HintRung,
  opts: TutorApiOptions = {},
): Promise<TutorResult<GiveHintOutput>> {
  return postJson<GiveHintOutput>(
    `/api/tutor/episodes/${encodeURIComponent(episode_id)}/hint`,
    { rung },
    opts,
  );
}

export function submitCode(
  episode_id: string,
  code: string,
  opts: TutorApiOptions = {},
): Promise<TutorResult<GradeOutput>> {
  return postJson<GradeOutput>(
    `/api/tutor/episodes/${encodeURIComponent(episode_id)}/submit`,
    { code },
    opts,
  );
}

export function finishEpisode(
  episode_id: string,
  body: { outcome?: FinalOutcome; reveal_clicked?: boolean } = {},
  opts: TutorApiOptions = {},
): Promise<TutorResult<UpdateProfileOutput>> {
  return postJson<UpdateProfileOutput>(
    `/api/tutor/episodes/${encodeURIComponent(episode_id)}/finish`,
    body,
    opts,
  );
}

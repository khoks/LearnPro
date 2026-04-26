import type { SandboxRunRequestInput, SandboxRunResponse } from "@learnpro/sandbox";

export interface RunSandboxOk {
  ok: true;
  result: SandboxRunResponse;
}

export interface RunSandboxErr {
  ok: false;
  status: number;
  error: string;
  message?: string;
}

export type RunSandboxResult = RunSandboxOk | RunSandboxErr;

export interface RunSandboxOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function runSandbox(
  req: SandboxRunRequestInput,
  opts: RunSandboxOptions = {},
): Promise<RunSandboxResult> {
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f("/api/sandbox/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: opts.signal,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: "network_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const body = (await res.json().catch(() => null)) as
    | SandboxRunResponse
    | { error: string; message?: string }
    | null;

  if (!res.ok) {
    const error =
      body && typeof body === "object" && "error" in body ? body.error : "request_failed";
    const message =
      body && typeof body === "object" && "message" in body ? body.message : undefined;
    return { ok: false, status: res.status, error, ...(message ? { message } : {}) };
  }

  return { ok: true, result: body as SandboxRunResponse };
}

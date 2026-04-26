export interface RetryOptions {
  attempts: number;
  base_ms: number;
  max_ms: number;
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY: RetryOptions = {
  attempts: 3,
  base_ms: 250,
  max_ms: 4000,
};

export function isTransient(error: unknown): boolean {
  const status =
    (error as { status?: number; statusCode?: number })?.status ??
    (error as { status?: number; statusCode?: number })?.statusCode;
  if (typeof status === "number") {
    return status === 408 || status === 429 || (status >= 500 && status < 600);
  }
  const code = (error as { code?: string })?.code;
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EAI_AGAIN";
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<T> {
  const shouldRetry = opts.shouldRetry ?? isTransient;
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.attempts - 1 || !shouldRetry(err)) throw err;
      const delay = Math.min(opts.max_ms, opts.base_ms * Math.pow(2, attempt));
      await sleep(delay);
    }
  }
  throw lastErr;
}

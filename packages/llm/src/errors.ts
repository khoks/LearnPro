export class NotImplementedError extends Error {
  constructor(provider: string, method: string) {
    super(`${provider}.${method} is not implemented in MVP — see ADR-0003`);
    this.name = "NotImplementedError";
  }
}

export class LLMRequestError extends Error {
  readonly provider: string;
  override readonly cause?: unknown;

  constructor(message: string, provider: string, cause?: unknown) {
    super(message);
    this.name = "LLMRequestError";
    this.provider = provider;
    if (cause !== undefined) this.cause = cause;
  }
}

export class TokenBudgetExceededError extends Error {
  constructor(
    readonly user_id: string,
    readonly used: number,
    readonly limit: number,
  ) {
    super(`Daily token budget exceeded for user ${user_id}: used ${used} / limit ${limit}`);
    this.name = "TokenBudgetExceededError";
  }
}

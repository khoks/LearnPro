export class SandboxRequestError extends Error {
  readonly provider: string;
  override readonly cause?: unknown;

  constructor(message: string, provider: string, cause?: unknown) {
    super(message);
    this.name = "SandboxRequestError";
    this.provider = provider;
    if (cause !== undefined) this.cause = cause;
  }
}

export class SandboxLanguageNotSupportedError extends Error {
  constructor(provider: string, language: string) {
    super(`${provider} does not support language "${language}"`);
    this.name = "SandboxLanguageNotSupportedError";
  }
}

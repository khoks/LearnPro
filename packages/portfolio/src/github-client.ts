// STORY-040 — placeholder. Filled in commit 2.

export class GitHubPortfolioError extends Error {
  readonly status: number;
  readonly body: string | undefined;
  constructor(message: string, status: number, body?: string) {
    super(message);
    this.name = "GitHubPortfolioError";
    this.status = status;
    if (body !== undefined) this.body = body;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface EnsureRepoOutput {
  created: boolean;
}

export interface PushFileOutput {
  commit_sha: string;
}

export interface GitHubPortfolioClientOptions {
  token: string;
  fetch?: FetchLike;
  apiBase?: string;
}

export class GitHubPortfolioClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_opts: GitHubPortfolioClientOptions) {
    throw new Error("GitHubPortfolioClient: not yet implemented");
  }
}

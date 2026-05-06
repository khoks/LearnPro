export const PACKAGE_NAME = "@learnpro/portfolio";

export {
  GitHubPortfolioClient,
  GitHubPortfolioError,
  type EnsureRepoOutput,
  type FetchLike,
  type GitHubPortfolioClientOptions,
  type PushFileOutput,
} from "./github-client.js";

export {
  DEFAULT_REPO_NAME,
  generateReadme,
  problemDirectorySlug,
  README_FOOTER_BACKLINK,
  type GenerateReadmeInput,
  type ReadmeProblem,
  type ReadmeSubmission,
} from "./templates.js";

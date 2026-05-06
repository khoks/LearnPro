// STORY-040 — placeholder. Filled in commit 2.

export const DEFAULT_REPO_NAME = "learnpro-portfolio";

export const README_FOOTER_BACKLINK = "Solved on [LearnPro](https://learnpro.dev)";

export interface ReadmeProblem {
  name: string;
  slug: string;
  language: "python" | "typescript";
  statement: string;
  track_name?: string;
  track_slug?: string;
}

export interface ReadmeSubmission {
  code: string;
}

export interface GenerateReadmeInput {
  problem: ReadmeProblem;
  submission: ReadmeSubmission;
  include_back_link?: boolean;
}

export function generateReadme(_input: GenerateReadmeInput): string {
  throw new Error("generateReadme: not yet implemented");
}

export function problemDirectorySlug(_p: ReadmeProblem): string {
  throw new Error("problemDirectorySlug: not yet implemented");
}

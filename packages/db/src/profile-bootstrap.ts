import type { LearnProDb } from "./client.js";
import { profiles, SELF_HOSTED_ORG_ID } from "./schema.js";

export interface BootstrapProfileOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
}

// Idempotently inserts an empty profile row for a freshly-signed-in user. All optional fields stay
// null until the conversational onboarding agent (STORY-053) populates them. `ON CONFLICT DO NOTHING`
// makes this safe to call on every login — only the first call writes.
export async function bootstrapProfile(opts: BootstrapProfileOptions): Promise<void> {
  await opts.db
    .insert(profiles)
    .values({
      user_id: opts.user_id,
      org_id: opts.org_id ?? SELF_HOSTED_ORG_ID,
    })
    .onConflictDoNothing();
}

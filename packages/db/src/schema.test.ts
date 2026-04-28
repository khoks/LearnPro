import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  agent_calls,
  agentRoleEnum,
  agentTaskEnum,
  ALL_TABLES,
  concepts,
  episodes,
  finalOutcomeEnum,
  interactions,
  interactionTypeEnum,
  notificationChannelEnum,
  notifications,
  ORG_SCOPED_TABLES,
  organizations,
  problems,
  profiles,
  SELF_HOSTED_ORG_ID,
  skill_scores,
  submissionLanguageEnum,
  submissions,
  tracks,
  users,
} from "./schema.js";

describe("schema: SaaS-readiness primitive (org_id everywhere)", () => {
  it("every tenant-scoped table has an org_id column", () => {
    for (const table of ORG_SCOPED_TABLES) {
      const cols = getTableColumns(table);
      expect(Object.keys(cols), `${getTableName(table)} missing org_id column`).toContain("org_id");
    }
  });

  it("organizations is the tenant root and is intentionally excluded from ORG_SCOPED_TABLES", () => {
    expect(ALL_TABLES).toContain(organizations);
    expect(ORG_SCOPED_TABLES as readonly unknown[]).not.toContain(organizations);
  });

  it("SELF_HOSTED_ORG_ID is the literal 'self' constant", () => {
    expect(SELF_HOSTED_ORG_ID).toBe("self");
  });
});

describe("schema: episodes.embedding (pgvector)", () => {
  it("declares a vector column with 1536 dimensions", () => {
    const cols = getTableColumns(episodes);
    const embedding = cols.embedding;
    expect(embedding, "episodes.embedding column missing").toBeDefined();
    expect(embedding?.getSQLType()).toBe("vector(1536)");
  });

  it("episodes embedding column is nullable (filled lazily by reflection job)", () => {
    const cols = getTableColumns(episodes);
    expect(cols.embedding?.notNull).toBe(false);
  });

  it("declares an IVFFlat index on embedding using cosine ops (STORY-014)", () => {
    const config = getTableConfig(episodes);
    const ivfIndex = config.indexes.find((i) => i.config.name === "episodes_embedding_ivfflat_idx");
    expect(ivfIndex, "IVFFlat index on episodes.embedding missing").toBeDefined();
    expect(ivfIndex?.config.method).toBe("ivfflat");
  });
});

describe("schema: enums", () => {
  it("episode_outcome covers all terminal states (incl. revealed for full-solution unlock)", () => {
    expect(finalOutcomeEnum.enumValues).toEqual([
      "passed",
      "passed_with_hints",
      "failed",
      "abandoned",
      "revealed",
    ]);
  });

  it("agent_role mirrors LLMRoleSchema in @learnpro/llm", () => {
    expect(agentRoleEnum.enumValues).toEqual([
      "tutor",
      "interviewer",
      "reflection",
      "grader",
      "router",
    ]);
  });

  it("notification_channel covers in-app + web push + email + whatsapp", () => {
    expect(notificationChannelEnum.enumValues).toEqual(["in_app", "web_push", "email", "whatsapp"]);
  });

  it("submission_language is python + typescript (MVP scope)", () => {
    expect(submissionLanguageEnum.enumValues).toEqual(["python", "typescript"]);
  });

  it("agent_task mirrors LLMTelemetryEventSchema.task in @learnpro/llm", () => {
    expect(agentTaskEnum.enumValues).toEqual(["complete", "stream", "embed", "tool_call"]);
  });

  it("interaction_type mirrors InteractionTypeSchema in @learnpro/shared (STORY-055)", () => {
    expect(interactionTypeEnum.enumValues).toEqual([
      "cursor_focus",
      "voice",
      "edit",
      "revert",
      "run",
      "submit",
      "hint_request",
      "hint_received",
      "autonomy_decision",
    ]);
  });
});

describe("schema: agent_calls (telemetry sink target — STORY-012/060)", () => {
  it("carries every LLMTelemetryEvent field needed for cost analytics", () => {
    const cols = getTableColumns(agent_calls);
    expect(cols.session_id).toBeDefined();
    expect(cols.task).toBeDefined();
    expect(cols.task.notNull).toBe(true);
    expect(cols.cached_tokens).toBeDefined();
    expect(cols.cost_usd).toBeDefined();
    expect(cols.cost_usd.notNull).toBe(true);
    expect(cols.pricing_version).toBeDefined();
    expect(cols.pricing_version.notNull).toBe(true);
    expect(cols.tool_used).toBeDefined();
  });

  it("cost_usd uses numeric for float-safe storage (precision 18, scale 8)", () => {
    const cols = getTableColumns(agent_calls);
    expect(cols.cost_usd.getSQLType()).toBe("numeric(18, 8)");
  });
});

describe("schema: interactions (STORY-055 telemetry sink target)", () => {
  it("carries id / org_id / user_id / episode_id / type / payload / t / created_at", () => {
    const cols = getTableColumns(interactions);
    expect(cols.id?.primary).toBe(true);
    expect(cols.org_id?.notNull).toBe(true);
    expect(cols.user_id).toBeDefined();
    expect(cols.user_id?.notNull).toBe(false); // nullable until auth lands (STORY-005)
    expect(cols.episode_id).toBeDefined();
    expect(cols.episode_id?.notNull).toBe(false); // nullable for the playground (no episode flow yet)
    expect(cols.type?.notNull).toBe(true);
    expect(cols.payload?.notNull).toBe(true);
    expect(cols.t?.notNull).toBe(true);
    expect(cols.created_at?.notNull).toBe(true);
  });

  it("payload uses jsonb (per-event-type shape lives in the Zod discriminated union)", () => {
    const cols = getTableColumns(interactions);
    expect(cols.payload?.getSQLType()).toBe("jsonb");
  });

  it("declares (episode_id, t) and (user_id, t) indexes for tutor / per-user scans", () => {
    const config = getTableConfig(interactions);
    const names = config.indexes.map((i) => i.config.name);
    expect(names).toContain("interactions_episode_t_idx");
    expect(names).toContain("interactions_user_t_idx");
  });

  it("episodes carries an interactions_summary jsonb for fast tutor-time reads", () => {
    const cols = getTableColumns(episodes);
    expect(cols.interactions_summary).toBeDefined();
    expect(cols.interactions_summary?.getSQLType()).toBe("jsonb");
    expect(cols.interactions_summary?.notNull).toBe(false);
  });
});

describe("schema: critical FK / PK columns", () => {
  it("profiles is keyed on user_id (1:1 with users)", () => {
    const cols = getTableColumns(profiles);
    expect(cols.user_id?.primary).toBe(true);
  });

  it("skill_scores has both user_id and concept_id (composite PK)", () => {
    const cols = getTableColumns(skill_scores);
    expect(cols.user_id).toBeDefined();
    expect(cols.concept_id).toBeDefined();
  });

  it("concepts has parent_concept_id for the knowledge-graph hierarchy", () => {
    const cols = getTableColumns(concepts);
    expect(cols.parent_concept_id).toBeDefined();
  });

  it("episodes references both user and problem", () => {
    const cols = getTableColumns(episodes);
    expect(cols.user_id?.notNull).toBe(true);
    expect(cols.problem_id?.notNull).toBe(true);
  });

  it("problems references its parent track", () => {
    const cols = getTableColumns(problems);
    expect(cols.track_id?.notNull).toBe(true);
  });

  it("submissions references its parent episode", () => {
    const cols = getTableColumns(submissions);
    expect(cols.episode_id?.notNull).toBe(true);
  });

  it("notifications references its target user", () => {
    const cols = getTableColumns(notifications);
    expect(cols.user_id?.notNull).toBe(true);
  });

  it("users has email + github_id columns for auth lookup", () => {
    const cols = getTableColumns(users);
    expect(cols.email?.notNull).toBe(true);
    expect(cols.github_id).toBeDefined();
  });

  it("tracks declares its language via the submission_language enum", () => {
    const cols = getTableColumns(tracks);
    expect(cols.language?.notNull).toBe(true);
  });
});

describe("schema: SaaS-readiness invariants", () => {
  it("every tenant-scoped table's org_id column is NOT NULL with default 'self'", () => {
    for (const table of ORG_SCOPED_TABLES) {
      const cols = getTableColumns(table);
      const orgId = cols.org_id;
      expect(orgId, `${getTableName(table)}.org_id missing`).toBeDefined();
      expect(orgId.notNull, `${getTableName(table)}.org_id must be NOT NULL`).toBe(true);
      expect(orgId.default, `${getTableName(table)}.org_id must default to 'self'`).toBe("self");
    }
  });
});

import { relations } from "drizzle-orm";
import {
  agent_calls,
  concepts,
  episodes,
  interactions,
  notifications,
  organizations,
  problems,
  profiles,
  skill_scores,
  submissions,
  tracks,
  users,
} from "./schema.js";

export const usersRelations = relations(users, ({ one, many }) => ({
  org: one(organizations, { fields: [users.org_id], references: [organizations.id] }),
  profile: one(profiles, { fields: [users.id], references: [profiles.user_id] }),
  episodes: many(episodes),
  skill_scores: many(skill_scores),
  agent_calls: many(agent_calls),
  interactions: many(interactions),
  notifications: many(notifications),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.user_id], references: [users.id] }),
}));

export const conceptsRelations = relations(concepts, ({ one, many }) => ({
  parent: one(concepts, {
    fields: [concepts.parent_concept_id],
    references: [concepts.id],
    relationName: "concept_parent",
  }),
  children: many(concepts, { relationName: "concept_parent" }),
  skill_scores: many(skill_scores),
}));

export const skillScoresRelations = relations(skill_scores, ({ one }) => ({
  user: one(users, { fields: [skill_scores.user_id], references: [users.id] }),
  concept: one(concepts, { fields: [skill_scores.concept_id], references: [concepts.id] }),
}));

export const tracksRelations = relations(tracks, ({ many }) => ({
  problems: many(problems),
}));

export const problemsRelations = relations(problems, ({ one, many }) => ({
  track: one(tracks, { fields: [problems.track_id], references: [tracks.id] }),
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  user: one(users, { fields: [episodes.user_id], references: [users.id] }),
  problem: one(problems, { fields: [episodes.problem_id], references: [problems.id] }),
  submissions: many(submissions),
  agent_calls: many(agent_calls),
  interactions: many(interactions),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  episode: one(episodes, { fields: [submissions.episode_id], references: [episodes.id] }),
}));

export const agentCallsRelations = relations(agent_calls, ({ one }) => ({
  user: one(users, { fields: [agent_calls.user_id], references: [users.id] }),
  episode: one(episodes, { fields: [agent_calls.episode_id], references: [episodes.id] }),
}));

export const interactionsRelations = relations(interactions, ({ one }) => ({
  user: one(users, { fields: [interactions.user_id], references: [users.id] }),
  episode: one(episodes, { fields: [interactions.episode_id], references: [episodes.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.user_id], references: [users.id] }),
}));

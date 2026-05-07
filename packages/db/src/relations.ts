import { relations } from "drizzle-orm";
import {
  accounts,
  agent_calls,
  concept_reviews,
  concepts,
  episodes,
  interactions,
  notifications,
  organizations,
  portfolio_pushes,
  prerequisites,
  problems,
  profile_insights,
  profiles,
  sessions,
  skill_scores,
  submissions,
  tracks,
  users,
  web_push_subscriptions,
} from "./schema.js";

export const usersRelations = relations(users, ({ one, many }) => ({
  org: one(organizations, { fields: [users.org_id], references: [organizations.id] }),
  profile: one(profiles, { fields: [users.id], references: [profiles.user_id] }),
  accounts: many(accounts),
  sessions: many(sessions),
  episodes: many(episodes),
  skill_scores: many(skill_scores),
  agent_calls: many(agent_calls),
  interactions: many(interactions),
  notifications: many(notifications),
  web_push_subscriptions: many(web_push_subscriptions),
  concept_reviews: many(concept_reviews),
  portfolio_pushes: many(portfolio_pushes),
  profile_insights: many(profile_insights),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
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
  concept_reviews: many(concept_reviews),
  outgoing_prerequisites: many(prerequisites, { relationName: "concept_from" }),
  incoming_prerequisites: many(prerequisites, { relationName: "concept_to" }),
}));

export const prerequisitesRelations = relations(prerequisites, ({ one }) => ({
  from_concept: one(concepts, {
    fields: [prerequisites.from_concept_id],
    references: [concepts.id],
    relationName: "concept_from",
  }),
  to_concept: one(concepts, {
    fields: [prerequisites.to_concept_id],
    references: [concepts.id],
    relationName: "concept_to",
  }),
}));

export const conceptReviewsRelations = relations(concept_reviews, ({ one }) => ({
  user: one(users, { fields: [concept_reviews.user_id], references: [users.id] }),
  concept: one(concepts, { fields: [concept_reviews.concept_id], references: [concepts.id] }),
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

export const webPushSubscriptionsRelations = relations(web_push_subscriptions, ({ one }) => ({
  user: one(users, { fields: [web_push_subscriptions.user_id], references: [users.id] }),
}));

export const portfolioPushesRelations = relations(portfolio_pushes, ({ one }) => ({
  user: one(users, { fields: [portfolio_pushes.user_id], references: [users.id] }),
  episode: one(episodes, { fields: [portfolio_pushes.episode_id], references: [episodes.id] }),
}));

export const profileInsightsRelations = relations(profile_insights, ({ one }) => ({
  user: one(users, { fields: [profile_insights.user_id], references: [users.id] }),
}));

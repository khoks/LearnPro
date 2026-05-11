// STORY-045 — public surface for the email-digest channel + transports + builders. Imported via
// `@learnpro/notifications/email` (mapped through the package.json `exports` field).

export { EmailChannel, type EmailChannelOptions } from "./email-channel.js";
export {
  MockEmailTransport,
  NoopEmailTransport,
  type EmailMessage,
  type EmailSendResult,
  type EmailTransport,
} from "./transport.js";
export { ResendTransport, type ResendTransportOptions } from "./resend-transport.js";
export { PostmarkTransport, type PostmarkTransportOptions } from "./postmark-transport.js";
export {
  buildDailyDigest,
  type DailyDigestEpisode,
  type DailyDigestInput,
  type DailyDigestPlanItem,
  type RenderedDigest as RenderedDailyDigest,
} from "./digests/daily.js";
export {
  buildWeeklyDigest,
  type RenderedDigest as RenderedWeeklyDigest,
  type WeeklyDigestEpisode,
  type WeeklyDigestInput,
  type WeeklyDigestMasteryDelta,
  type WeeklyDigestSkillSnapshotRow,
} from "./digests/weekly.js";
export {
  containsForbiddenPhrase,
  DAILY_DIGEST_SUBJECT,
  EMPTY_DAILY_BODY,
  EMPTY_WEEKLY_BODY,
  FORBIDDEN_PHRASES,
  UNSUBSCRIBE_FOOTER,
  UNSUBSCRIBE_LINK_TEXT,
  UNSUBSCRIBE_SUCCESS_BODY,
  UNSUBSCRIBE_SUCCESS_TITLE,
  UNSUBSCRIBE_UNKNOWN_BODY,
  UNSUBSCRIBE_UNKNOWN_TITLE,
  WEEKLY_DIGEST_SUBJECT,
} from "./copy.js";

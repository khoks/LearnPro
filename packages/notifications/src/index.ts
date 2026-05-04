export const PACKAGE_NAME = "@learnpro/notifications";

export {
  NotificationChannelNameSchema,
  NotificationInputSchema,
  type NotificationChannel,
  type NotificationChannelName,
  type NotificationDeliveryResult,
  type NotificationInput,
} from "./channel.js";

export { InAppChannel, type InAppChannelOptions } from "./in-app-channel.js";

export {
  WebPushChannel,
  type WebPushChannelOptions,
  type WebPushSendError,
  type WebPushSender,
} from "./web-push-channel.js";

export {
  ALWAYS_DELIVER,
  NotificationDispatcher,
  type DispatchOptions,
  type DispatchOutcome,
  type NotificationDispatcherOptions,
  type ShouldDeliverNow,
} from "./dispatcher.js";

export {
  dispatcherWithQuietHours,
  QuietHoursDispatcher,
  type DeferDeliveryFn,
  type DispatcherWithQuietHoursOptions,
} from "./dispatcher-factory.js";

export {
  processDeferredNotifications,
  type DueDeferredRow,
  type ProcessDeferredNotificationsOptions,
  type ProcessDeferredNotificationsOutcome,
  type ProcessDispatcherLike,
} from "./deferred-flusher.js";

export {
  containsForbiddenPhrase,
  dailyDedupeKey,
  DAILY_REMINDER_BODY,
  DAILY_REMINDER_TITLE,
  FORBIDDEN_PHRASES,
  TEST_PUSH_BODY,
  TEST_PUSH_TITLE,
} from "./copy.js";

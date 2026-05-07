import {
  createDb,
  getQuietHoursConfig,
  insertDeferredNotification,
  loadDatabaseUrl,
} from "@learnpro/db";
import {
  dailyDedupeKey,
  DAILY_REMINDER_BODY,
  DAILY_REMINDER_TITLE,
  dispatcherWithQuietHours,
  InAppChannel,
  NotificationDispatcher,
  QuietHoursDispatcher,
  WebPushChannel,
  type NotificationChannel,
} from "@learnpro/notifications";
import {
  EmailChannel,
  NoopEmailTransport,
  ResendTransport,
  type EmailTransport,
} from "@learnpro/notifications/email";
import { profiles, users } from "@learnpro/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { buildWebPushSender, configureVapid, type WebPushConfig } from "./notifications-vapid.js";
import { runDailyEmailDigest } from "./email-digest-cron.js";

// STORY-023 — daily-reminder script. Wired to system cron in self-hosted deployments
// (`pnpm --filter @learnpro/api daily-reminder`). Iterates every user with a configured
// `profiles.time_budget_min` and dispatches the warm-coach reminder through the in-app +
// (when configured) web_push channels. Idempotent inside a 24h window via `dailyDedupeKey()`
// — running twice in the same UTC day delivers exactly once per channel.
//
// STORY-024 — production wiring uses `dispatcherWithQuietHours()`: dispatches inside a user's
// quiet window are written to `deferred_notifications` instead of being sent. The flusher drains
// the table when the window opens. Notifications are deferred, never dropped (AC #4).

interface ReminderOutcome {
  user_id: string;
  any_delivered: boolean;
  per_channel: Array<{ channel: string; delivered: boolean; reason?: string }>;
}

export interface RunDailyReminderOptions {
  // Drizzle handle. Production resolves from DATABASE_URL.
  db: import("@learnpro/db").LearnProDb;
  dispatcher: NotificationDispatcher | QuietHoursDispatcher;
  now?: Date;
}

export async function runDailyReminder(opts: RunDailyReminderOptions): Promise<ReminderOutcome[]> {
  const now = opts.now ?? new Date();
  const dedupeKey = dailyDedupeKey(now);
  const targets = await opts.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(profiles, eq(profiles.user_id, users.id))
    .where(and(isNotNull(profiles.time_budget_min)));

  const outcomes: ReminderOutcome[] = [];
  for (const target of targets) {
    const result = await opts.dispatcher.dispatch(
      {
        user_id: target.id,
        title: DAILY_REMINDER_TITLE,
        body: DAILY_REMINDER_BODY,
        dedupe_key: dedupeKey,
        metadata: { url: "/dashboard" },
      },
      { now },
    );
    outcomes.push({
      user_id: target.id,
      any_delivered: result.any_delivered,
      per_channel: result.results.map((r) => ({
        channel: r.channel,
        delivered: r.delivered,
        ...(r.reason !== undefined && { reason: r.reason }),
      })),
    });
  }
  return outcomes;
}

async function main(): Promise<void> {
  const url = loadDatabaseUrl(process.env);
  const { db, pool } = createDb({ connectionString: url });
  try {
    const vapid = (() => {
      const publicKey = process.env["VAPID_PUBLIC_KEY"];
      const privateKey = process.env["VAPID_PRIVATE_KEY"];
      const subject = process.env["VAPID_SUBJECT"] ?? "mailto:hello@learnpro.local";
      if (!publicKey || !privateKey) return null;
      return { publicKey, privateKey, subject } satisfies WebPushConfig;
    })();
    const channels: NotificationChannel[] = [new InAppChannel({ db })];
    if (vapid) {
      configureVapid(vapid);
      channels.push(new WebPushChannel({ db, sender: buildWebPushSender() }));
    }
    // STORY-045 — EmailChannel always sits in the dispatcher chain. Production wires Resend
    // when LEARNPRO_EMAIL_PROVIDER=resend + RESEND_API_KEY are set; otherwise the noop transport
    // makes every send a non-fatal no-op.
    channels.push(new EmailChannel({ transport: pickEmailTransport() }));
    // STORY-024 — wrap with quiet-hours filtering. Dispatches inside the user's window get
    // serialized into deferred_notifications and a separate cron drains the table.
    const { dispatcher } = dispatcherWithQuietHours({
      channels,
      getQuietHoursConfig: (user_id) => getQuietHoursConfig(db, user_id),
      deferDelivery: async (input) => {
        await insertDeferredNotification({
          db,
          user_id: input.user_id,
          payload: input.payload,
          deliver_after: input.deliver_after,
        });
      },
    });
    const outcomes = await runDailyReminder({ db, dispatcher });
    const delivered = outcomes.filter((o) => o.any_delivered).length;
    console.log(
      `[daily-reminder] dispatched to ${outcomes.length} users; ${delivered} had ≥1 channel deliver`,
    );

    // STORY-045 — fire the daily email digest off the same cron. Recipients are filtered by
    // `email_daily_opt_in=true`; the dispatcher's channel filter restricts dispatch to email
    // only so the bell-icon panel + Web Push aren't double-sent.
    const digestOutcomes = await runDailyEmailDigest({
      db,
      dispatcher,
      unsubscribeBaseUrl: process.env["LEARNPRO_PUBLIC_BASE_URL"] ?? "https://learnpro.local",
    });
    const digestDelivered = digestOutcomes.filter((o) => o.any_delivered).length;
    console.log(
      `[daily-digest] dispatched to ${digestOutcomes.length} opted-in users; ${digestDelivered} delivered`,
    );
  } finally {
    await pool.end();
  }
}

function pickEmailTransport(): EmailTransport {
  const provider = (process.env["LEARNPRO_EMAIL_PROVIDER"] ?? "noop").toLowerCase();
  if (provider === "resend") {
    const apiKey = process.env["RESEND_API_KEY"];
    const defaultFrom = process.env["LEARNPRO_EMAIL_FROM"];
    if (!apiKey || !defaultFrom) {
      return new NoopEmailTransport();
    }
    return new ResendTransport({ apiKey, defaultFrom });
  }
  return new NoopEmailTransport();
}

const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("daily-reminder.ts") || argv1.endsWith("daily-reminder.js")) {
  main().catch((err: unknown) => {
    console.error("[daily-reminder] failed:", err);
    process.exit(1);
  });
}

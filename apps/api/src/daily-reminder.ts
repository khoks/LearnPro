import { createDb, loadDatabaseUrl } from "@learnpro/db";
import {
  dailyDedupeKey,
  DAILY_REMINDER_BODY,
  DAILY_REMINDER_TITLE,
  InAppChannel,
  NotificationDispatcher,
  WebPushChannel,
  type NotificationChannel,
} from "@learnpro/notifications";
import { profiles, users } from "@learnpro/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { buildWebPushSender, configureVapid, type WebPushConfig } from "./notifications-vapid.js";

// STORY-023 — daily-reminder script. Wired to system cron in self-hosted deployments
// (`pnpm --filter @learnpro/api daily-reminder`). Iterates every user with a configured
// `profiles.time_budget_min` and dispatches the warm-coach reminder through the in-app +
// (when configured) web_push channels. Idempotent inside a 24h window via `dailyDedupeKey()`
// — running twice in the same UTC day delivers exactly once per channel.
//
// Design note: STORY-024 will add quiet-hours filtering. The dispatcher's `shouldDeliverNow`
// hook is the seam — STORY-024 wires its quiet-hours predicate into the same `dispatcher`
// constructor here without touching the rest of this file.

interface ReminderOutcome {
  user_id: string;
  any_delivered: boolean;
  per_channel: Array<{ channel: string; delivered: boolean; reason?: string }>;
}

export interface RunDailyReminderOptions {
  // Drizzle handle. Production resolves from DATABASE_URL.
  db: import("@learnpro/db").LearnProDb;
  dispatcher: NotificationDispatcher;
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
    const dispatcher = new NotificationDispatcher({ channels });
    const outcomes = await runDailyReminder({ db, dispatcher });
    const delivered = outcomes.filter((o) => o.any_delivered).length;
    console.log(
      `[daily-reminder] dispatched to ${outcomes.length} users; ${delivered} had ≥1 channel deliver`,
    );
  } finally {
    await pool.end();
  }
}

const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("daily-reminder.ts") || argv1.endsWith("daily-reminder.js")) {
  main().catch((err: unknown) => {
    console.error("[daily-reminder] failed:", err);
    process.exit(1);
  });
}

import {
  createDb,
  getQuietHoursConfig,
  insertDeferredNotification,
  loadDatabaseUrl,
} from "@learnpro/db";
import {
  dispatcherWithQuietHours,
  InAppChannel,
  type NotificationChannel,
} from "@learnpro/notifications";
import {
  EmailChannel,
  NoopEmailTransport,
  ResendTransport,
  type EmailTransport,
} from "@learnpro/notifications/email";
import { runWeeklyEmailDigest } from "./email-digest-cron.js";

// STORY-045 — Weekly digest cron. Mirrors the shape of `daily-reminder.ts`: this script is
// invocable via `pnpm --filter @learnpro/api weekly-digest` from a system cron (one fire per
// day, ideally early morning UTC; the helper filters recipients by their preferred ISO weekday
// so a Monday-preferred user only receives on Monday).
//
// Notifications are routed through the EmailChannel only — the bell icon + Web Push are noisy
// for a weekly recap, and the dispatcher's `channels: ["email"]` filter restricts the dispatch.

async function main(): Promise<void> {
  const url = loadDatabaseUrl(process.env);
  const { db, pool } = createDb({ connectionString: url });
  try {
    const channels: NotificationChannel[] = [
      // The InAppChannel still sits in the dispatcher chain for parity with production wiring,
      // but the channel filter on the dispatch call excludes it from being touched.
      new InAppChannel({ db }),
      new EmailChannel({ transport: pickTransport() }),
    ];
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
    const outcomes = await runWeeklyEmailDigest({
      db,
      dispatcher,
      unsubscribeBaseUrl: process.env["LEARNPRO_PUBLIC_BASE_URL"] ?? "https://learnpro.local",
    });
    const delivered = outcomes.filter((o) => o.any_delivered).length;
    console.log(
      `[weekly-digest] dispatched to ${outcomes.length} eligible users; ${delivered} had delivery confirmed`,
    );
  } finally {
    await pool.end();
  }
}

function pickTransport(): EmailTransport {
  const provider = (process.env["LEARNPRO_EMAIL_PROVIDER"] ?? "noop").toLowerCase();
  if (provider === "resend") {
    const apiKey = process.env["RESEND_API_KEY"];
    const defaultFrom = process.env["LEARNPRO_EMAIL_FROM"];
    if (!apiKey || !defaultFrom) {
      console.warn(
        "[weekly-digest] LEARNPRO_EMAIL_PROVIDER=resend set but RESEND_API_KEY or LEARNPRO_EMAIL_FROM missing — falling back to noop",
      );
      return new NoopEmailTransport();
    }
    return new ResendTransport({ apiKey, defaultFrom });
  }
  return new NoopEmailTransport();
}

const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("weekly-digest.ts") || argv1.endsWith("weekly-digest.js")) {
  main().catch((err: unknown) => {
    console.error("[weekly-digest] failed:", err);
    process.exit(1);
  });
}

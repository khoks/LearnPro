import webPush from "web-push";
import type { WebPushSender } from "@learnpro/notifications";

// STORY-023 — VAPID config + the production WebPushSender. Kept off the index.ts hot path so
// loading the `web-push` package only happens when notifications routes are actually wired.

export interface WebPushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function loadWebPushConfigFromEnv(env: NodeJS.ProcessEnv): WebPushConfig | null {
  const publicKey = env["VAPID_PUBLIC_KEY"];
  const privateKey = env["VAPID_PRIVATE_KEY"];
  const subject = env["VAPID_SUBJECT"] ?? "mailto:hello@learnpro.local";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

// Sets the library-wide VAPID details. Idempotent — calling twice with the same config is fine.
// `web-push` stores the keys on a module-level singleton; that's fine for self-hosted single-
// instance deployments.
export function configureVapid(config: WebPushConfig): void {
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
}

export function buildWebPushSender(): WebPushSender {
  return {
    async sendNotification(subscription, payload) {
      // The cast is safe — `web-push` types accept any extra fields on the subscription. Our
      // narrower `WebPushSender` shape mirrors only what we need.
      await webPush.sendNotification(subscription, payload);
    },
  };
}

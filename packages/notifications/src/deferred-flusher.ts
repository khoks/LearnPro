import { NotificationInputSchema, type NotificationInput } from "./channel.js";
import type { DispatchOutcome } from "./dispatcher.js";

// STORY-024 — drains the `deferred_notifications` table and dispatches each due row through the
// supplied dispatcher. Idempotent + safe to call repeatedly: per-call `LIMIT 100` (caller-owned),
// row-by-row processing, delete-on-dispatch semantics.
//
// `dispatcherLike.dispatch()` re-checks quiet hours via the wrapped policy on the way through. If
// the user re-entered quiet hours between defer-time and flush-time, the row is *re-deferred* (not
// dropped) — the dispatcher writes a new row and we delete the old one.

export interface DueDeferredRow {
  id: string;
  user_id: string;
  // The serialized payload as written by `insertDeferredNotification`.
  payload: unknown;
}

export type ProcessDispatcherLike = {
  dispatch: (input: NotificationInput, opts?: { now?: Date }) => Promise<DispatchOutcome>;
};

export interface ProcessDeferredNotificationsOptions {
  // Returns rows whose `deliver_after <= now`, oldest first.
  listDue: (now: Date, limit?: number) => Promise<DueDeferredRow[]>;
  // Deletes a single row by id; returns true on success.
  deleteRow: (id: string) => Promise<boolean>;
  dispatcher: ProcessDispatcherLike;
  now?: Date;
  limit?: number;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface ProcessDeferredNotificationsOutcome {
  processed: number;
  delivered: number;
  // Rows whose payload failed to validate as a `NotificationInput` (after re-attaching user_id).
  // These are deleted so the table doesn't fill with poison.
  malformed: number;
  // Rows whose dispatch threw (delete + log; the dispatcher's wrapped quiet-hours dispatcher
  // re-defers cleanly on its own — only true throws land here).
  errored: number;
}

export async function processDeferredNotifications(
  opts: ProcessDeferredNotificationsOptions,
): Promise<ProcessDeferredNotificationsOutcome> {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;
  const due = await opts.listDue(now, limit);
  let delivered = 0;
  let malformed = 0;
  let errored = 0;

  for (const row of due) {
    const payload = extractPayload(row);
    const candidate = NotificationInputSchema.safeParse({
      user_id: row.user_id,
      ...payload,
    });
    if (!candidate.success) {
      malformed += 1;
      log("[deferred-flusher] dropping malformed row", {
        id: row.id,
        issues: candidate.error.issues,
      });
      await opts.deleteRow(row.id);
      continue;
    }
    try {
      const outcome = await opts.dispatcher.dispatch(candidate.data, { now });
      if (outcome.any_delivered) delivered += 1;
    } catch (err) {
      errored += 1;
      log("[deferred-flusher] dispatch threw", {
        id: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    // Always delete the source row — re-deferral is the dispatcher's job (it writes a fresh row
    // with the new deliver_after). Leaving the old row would cause double-fires when the new row
    // matures.
    await opts.deleteRow(row.id);
  }

  return { processed: due.length, delivered, malformed, errored };
}

function extractPayload(row: DueDeferredRow): Record<string, unknown> {
  if (row.payload && typeof row.payload === "object") {
    return row.payload as Record<string, unknown>;
  }
  return {};
}

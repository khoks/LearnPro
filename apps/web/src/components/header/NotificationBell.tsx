"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { enableWebPush, type SubscriptionPayload } from "../../lib/web-push-client.js";

void React;

// STORY-023 — bell-icon header widget. Auth-gated implicitly (the proxies return 401 if there's
// no session; the bell renders an empty state in that case rather than throwing).

interface NotificationItem {
  id: string;
  channel: "in_app" | "web_push" | "email" | "whatsapp";
  title: string;
  body: string | null;
  sent_at: string;
  read_at: string | null;
}

export interface NotificationBellProps {
  // Override fetch + the post-subscription helper for tests / Storybook. Defaults call the
  // real Next.js proxy routes.
  fetcher?: typeof fetch;
  fetchVapidKey?: () => Promise<string | null>;
  postSubscription?: (payload: SubscriptionPayload) => Promise<{ ok: boolean }>;
  // Skip the initial poll (tests).
  pollOnMount?: boolean;
}

const CARD_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  width: 360,
  maxHeight: 480,
  overflow: "auto",
  background: "white",
  border: "1px solid #ddd",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  padding: "0.5rem 0",
  zIndex: 50,
};

const BUTTON_STYLE: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  border: "1px solid #ddd",
  borderRadius: 6,
  background: "white",
  cursor: "pointer",
  fontSize: "1.1rem",
};

const BADGE_STYLE: React.CSSProperties = {
  position: "absolute",
  top: -4,
  right: -4,
  minWidth: 18,
  height: 18,
  padding: "0 4px",
  borderRadius: 9,
  background: "#3a82f7",
  color: "white",
  fontSize: "0.7rem",
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

function formatRelative(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function NotificationBell(props: NotificationBellProps = {}): React.ReactElement {
  const fetcher = props.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<"idle" | "enabling" | "enabled" | "denied" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!fetcher) return;
    try {
      const res = await fetcher("/api/notifications");
      if (!res.ok) return;
      const body = (await res.json()) as { items: NotificationItem[]; unread_count: number };
      setItems(body.items);
      setUnread(body.unread_count);
    } catch {
      // Network blip — keep the panel showing the last good snapshot.
    }
  }, [fetcher]);

  useEffect(() => {
    if (props.pollOnMount === false) return;
    void refresh();
  }, [refresh, props.pollOnMount]);

  // Close on click-outside.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const onToggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const onMarkAllRead = useCallback(async () => {
    if (!fetcher) return;
    try {
      await fetcher("/api/notifications/read-all", { method: "POST" });
      setItems((rows) =>
        rows.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })),
      );
      setUnread(0);
    } catch {
      // ignore
    }
  }, [fetcher]);

  const onMarkOneRead = useCallback(
    async (id: string) => {
      if (!fetcher) return;
      try {
        await fetcher(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
        setItems((rows) =>
          rows.map((r) =>
            r.id === id ? { ...r, read_at: r.read_at ?? new Date().toISOString() } : r,
          ),
        );
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        // ignore
      }
    },
    [fetcher],
  );

  const onEnablePush = useCallback(async () => {
    setPushState("enabling");
    setErrorMsg(null);
    try {
      const result = await enableWebPush({
        fetchVapidKey:
          props.fetchVapidKey ??
          (async () => {
            if (!fetcher) return null;
            const r = await fetcher("/api/notifications/vapid-key");
            if (!r.ok) return null;
            const body = (await r.json()) as { public_key?: string };
            return body.public_key ?? null;
          }),
        postSubscription:
          props.postSubscription ??
          (async (payload) => {
            if (!fetcher) return { ok: false };
            const r = await fetcher("/api/notifications/subscribe", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            return { ok: r.ok };
          }),
      });
      if (result.ok) {
        setPushState("enabled");
      } else if (result.reason === "denied") {
        setPushState("denied");
      } else {
        setPushState("error");
        setErrorMsg(result.reason);
      }
    } catch (err) {
      setPushState("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [fetcher, props.fetchVapidKey, props.postSubscription]);

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Notifications (${unread} unread)`}
        aria-expanded={open}
        data-testid="notification-bell-button"
        style={BUTTON_STYLE}
      >
        <span aria-hidden="true">{"\u{1F514}"}</span>
        {unread > 0 ? (
          <span aria-hidden="true" data-testid="notification-bell-badge" style={BADGE_STYLE}>
            {unread > 99 ? "99+" : String(unread)}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          data-testid="notification-bell-panel"
          style={CARD_STYLE}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.5rem 1rem",
              borderBottom: "1px solid #eee",
            }}
          >
            <strong style={{ fontSize: "0.95rem" }}>Notifications</strong>
            {unread > 0 ? (
              <button
                type="button"
                onClick={onMarkAllRead}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#3a82f7",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
                data-testid="mark-all-read-button"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <PushEnableSection state={pushState} errorMsg={errorMsg} onEnable={onEnablePush} />
          {items.length === 0 ? (
            <div style={{ padding: "1rem", color: "#888", fontSize: "0.9rem" }}>
              No notifications yet.
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {items.map((n) => (
                <li
                  key={n.id}
                  data-testid={`notification-item-${n.id}`}
                  style={{
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid #f3f3f3",
                    background: n.read_at ? "white" : "#f5f9ff",
                    cursor: n.read_at ? "default" : "pointer",
                  }}
                  onClick={() => {
                    if (!n.read_at) void onMarkOneRead(n.id);
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{n.title}</div>
                  {n.body ? (
                    <div style={{ fontSize: "0.85rem", color: "#444", marginTop: "0.15rem" }}>
                      {n.body}
                    </div>
                  ) : null}
                  <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.25rem" }}>
                    {formatRelative(n.sent_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface PushEnableSectionProps {
  state: "idle" | "enabling" | "enabled" | "denied" | "error";
  errorMsg: string | null;
  onEnable: () => void;
}

function PushEnableSection(props: PushEnableSectionProps): React.ReactElement | null {
  const { state, errorMsg, onEnable } = props;
  if (state === "enabled") {
    return (
      <div
        style={{
          padding: "0.5rem 1rem",
          fontSize: "0.85rem",
          color: "#0a7c4a",
          background: "#eafaf1",
        }}
        data-testid="push-status-enabled"
      >
        Browser notifications are on.
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div
        style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", color: "#666" }}
        data-testid="push-status-denied"
      >
        Browser notifications were declined. You can re-enable them in your browser settings.
      </div>
    );
  }
  return (
    <div
      style={{
        padding: "0.5rem 1rem",
        fontSize: "0.85rem",
        background: "#f8fafc",
        borderBottom: "1px solid #eee",
      }}
    >
      <button
        type="button"
        onClick={onEnable}
        disabled={state === "enabling"}
        data-testid="enable-push-button"
        style={{
          background: "#3a82f7",
          color: "white",
          border: "none",
          borderRadius: 6,
          padding: "0.4rem 0.8rem",
          fontWeight: 600,
          cursor: state === "enabling" ? "wait" : "pointer",
        }}
      >
        {state === "enabling" ? "Enabling…" : "Enable browser notifications"}
      </button>
      {state === "error" && errorMsg ? (
        <div
          style={{ marginTop: "0.4rem", color: "#9a1d1d", fontSize: "0.8rem" }}
          data-testid="push-status-error"
        >
          Couldn&apos;t enable: {errorMsg}.
        </div>
      ) : null}
    </div>
  );
}

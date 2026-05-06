"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

void React;

// STORY-040 — settings card for the GitHub portfolio integration. Three states:
//
//   1. Disconnected — "Connect GitHub portfolio" button explaining the `repo` scope.
//   2. Connected — repo name, recent pushes list, auto-push toggle, "Disconnect" button.
//   3. Loading / error — soft placeholder; never shame the user for an empty state.
//
// Coach-voice copy: warm, factual, explicit about scope. No urgency, no FOMO. The connect
// button explicitly states `repo` scope so the user can't be surprised on the GitHub Authorize
// screen.

export interface PortfolioState {
  connected: boolean;
  repo: string;
  auto_push: boolean;
  recent_pushes: ReadonlyArray<{
    id: string;
    episode_id: string;
    repo_owner: string;
    repo_name: string;
    directory_path: string;
    commit_sha: string;
    pushed_at: string;
    auto: boolean;
  }>;
}

export interface PortfolioCardProps {
  // Override fetch for tests / Storybook. Defaults to the real Next.js proxies.
  fetcher?: typeof fetch;
  // Skip the initial GET so tests can render with a fixed initial state.
  loadOnMount?: boolean;
  // Pre-set state (used by tests / SSR initial paint).
  initialState?: PortfolioState;
  // Optional ?status=... param surfaced as a banner — set by the OAuth callback redirect.
  oauthStatus?: string;
  // Optional GitHub login the OAuth callback redirected with — used in the success banner.
  oauthOwner?: string;
}

const CARD_STYLE: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "1rem 1.25rem",
  background: "white",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
};

const LABEL_STYLE: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "0.95rem",
};

const HELP_STYLE: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "#555",
  lineHeight: 1.4,
};

const PRIMARY_BUTTON_STYLE: React.CSSProperties = {
  background: "#3a82f7",
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "0.5rem 1rem",
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#222",
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: "0.5rem 1rem",
  fontWeight: 600,
  cursor: "pointer",
};

const DEFAULT_STATE: PortfolioState = {
  connected: false,
  repo: "learnpro-portfolio",
  auto_push: false,
  recent_pushes: [],
};

const STATUS_COPY: Record<string, string> = {
  connected: "GitHub portfolio connected. Save a passing solution to publish your first push.",
  denied: "You cancelled on GitHub. No worries — try again whenever you're ready.",
  invalid: "GitHub returned an unexpected response. Try connecting again.",
  unconfigured: "GitHub OAuth isn't configured on this server.",
  state_mismatch: "We couldn't verify the request. Try connecting again.",
  exchange_failed: "We couldn't trade the code for a token. Try connecting again.",
  missing_scope: "GitHub didn't grant the `repo` scope. Try again and approve `repo` access.",
  user_lookup_failed: "We connected but couldn't read your GitHub profile. Try reconnecting.",
};

export function PortfolioCard(props: PortfolioCardProps = {}): React.ReactElement {
  const fetcher = props.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const [state, setState] = useState<PortfolioState>(props.initialState ?? DEFAULT_STATE);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!fetcher) return;
    try {
      const res = await fetcher("/api/portfolio/state");
      if (!res.ok) return;
      const body = (await res.json()) as PortfolioState;
      setState(body);
    } catch {
      // soft-fail: stay on the rendered defaults
    }
  }, [fetcher]);

  useEffect(() => {
    if (props.loadOnMount === false) return;
    void refresh();
  }, [refresh, props.loadOnMount]);

  const onConnect = useCallback(async () => {
    if (!fetcher) return;
    setBusy("connect");
    setError(null);
    try {
      const res = await fetcher("/api/portfolio/connect-init", { method: "POST" });
      if (!res.ok) {
        setBusy(null);
        setError("Couldn't start the GitHub connect flow. Try again in a moment.");
        return;
      }
      const body = (await res.json()) as { start_url: string };
      // Top-level navigation so the OAuth state cookie set by /api/portfolio/oauth/start
      // round-trips with the Authorize redirect.
      window.location.href = body.start_url;
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [fetcher]);

  const onDisconnect = useCallback(async () => {
    if (!fetcher) return;
    setBusy("disconnect");
    setError(null);
    try {
      const res = await fetcher("/api/portfolio/disconnect", { method: "POST" });
      if (!res.ok) {
        setError("Couldn't disconnect. Try again in a moment.");
      } else {
        setState({ ...state, connected: false, recent_pushes: [] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [fetcher, state]);

  const onToggleAutoPush = useCallback(
    async (next: boolean) => {
      if (!fetcher) return;
      setBusy("toggle");
      setError(null);
      const previous = state.auto_push;
      setState((s) => ({ ...s, auto_push: next }));
      try {
        const res = await fetcher("/api/portfolio/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ auto_push: next }),
        });
        if (!res.ok) {
          setError("Couldn't update auto-push. Try again.");
          setState((s) => ({ ...s, auto_push: previous }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setState((s) => ({ ...s, auto_push: previous }));
      } finally {
        setBusy(null);
      }
    },
    [fetcher, state.auto_push],
  );

  return (
    <section
      aria-labelledby="portfolio-heading"
      style={CARD_STYLE}
      data-testid="portfolio-card"
      data-connected={state.connected ? "true" : "false"}
    >
      <div>
        <h2 id="portfolio-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
          GitHub portfolio
        </h2>
        <p style={HELP_STYLE}>
          When you pass a problem, save the solution to your own GitHub repo with one click.
          Recruiters can browse it; your work belongs to you.
        </p>
      </div>

      {props.oauthStatus && STATUS_COPY[props.oauthStatus] ? (
        <div
          role="status"
          data-testid="portfolio-oauth-banner"
          data-status={props.oauthStatus}
          style={{
            padding: "0.5rem 0.75rem",
            background: props.oauthStatus === "connected" ? "#e7f5ed" : "#fff7ed",
            border:
              props.oauthStatus === "connected"
                ? "1px solid #a3d8b6"
                : "1px solid #f4cba1",
            borderRadius: 6,
            fontSize: "0.9rem",
          }}
        >
          {STATUS_COPY[props.oauthStatus]}
          {props.oauthStatus === "connected" && props.oauthOwner ? (
            <>
              {" "}
              <span style={{ color: "#555" }}>
                (linked to <code>{props.oauthOwner}</code>)
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      {!state.connected ? (
        <DisconnectedView busy={busy} onConnect={onConnect} />
      ) : (
        <ConnectedView
          state={state}
          busy={busy}
          onDisconnect={onDisconnect}
          onToggleAutoPush={onToggleAutoPush}
        />
      )}

      {error ? (
        <div
          role="alert"
          data-testid="portfolio-error-banner"
          style={{ fontSize: "0.85rem", color: "#9a1d1d" }}
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}

function DisconnectedView({
  busy,
  onConnect,
}: {
  busy: string | null;
  onConnect: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p style={HELP_STYLE} data-testid="portfolio-scope-disclosure">
        This grants the <code>repo</code> scope so we can create a repository on your account
        and commit your solutions. We push only to the <code>learnpro-portfolio</code> repo
        unless you change the name in settings. You can revoke access on GitHub any time.
      </p>
      <div style={ROW_STYLE}>
        <button
          type="button"
          style={PRIMARY_BUTTON_STYLE}
          onClick={onConnect}
          disabled={busy === "connect"}
          data-testid="portfolio-connect-button"
        >
          {busy === "connect" ? "Opening GitHub…" : "Connect GitHub portfolio"}
        </button>
      </div>
    </div>
  );
}

function ConnectedView({
  state,
  busy,
  onDisconnect,
  onToggleAutoPush,
}: {
  state: PortfolioState;
  busy: string | null;
  onDisconnect: () => void;
  onToggleAutoPush: (next: boolean) => void;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>Repo</span>
        <code data-testid="portfolio-repo-name">{state.repo}</code>
      </div>

      <label style={ROW_STYLE}>
        <input
          type="checkbox"
          checked={state.auto_push}
          onChange={(e) => onToggleAutoPush(e.target.checked)}
          disabled={busy === "toggle"}
          data-testid="portfolio-auto-push-toggle"
        />
        <span>
          <span style={LABEL_STYLE}>Auto-push passing solutions</span>
          <br />
          <span style={HELP_STYLE}>
            When this is on, every passing attempt is saved without asking. Off by default.
          </span>
        </span>
      </label>

      <div>
        <h3 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>Recent pushes</h3>
        {state.recent_pushes.length === 0 ? (
          <p style={HELP_STYLE} data-testid="portfolio-empty-pushes">
            Nothing here yet — finish a problem and save your first one.
          </p>
        ) : (
          <ul
            data-testid="portfolio-recent-pushes"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}
          >
            {state.recent_pushes.slice(0, 10).map((push) => {
              const url = `https://github.com/${push.repo_owner}/${push.repo_name}/tree/HEAD/${push.directory_path}`;
              return (
                <li
                  key={push.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.9rem",
                  }}
                >
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#1d4ed8" }}
                  >
                    {push.directory_path}
                  </a>
                  <span style={{ color: "#666", fontVariantNumeric: "tabular-nums" }}>
                    {new Date(push.pushed_at).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div style={ROW_STYLE}>
        <button
          type="button"
          style={SECONDARY_BUTTON_STYLE}
          onClick={onDisconnect}
          disabled={busy === "disconnect"}
          data-testid="portfolio-disconnect-button"
        >
          {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    </div>
  );
}

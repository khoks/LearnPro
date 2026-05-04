"use client";

import { useState, type ReactElement } from "react";
import {
  ACCOUNT_DELETE_BUTTON,
  ACCOUNT_DELETE_CONFIRM_ACTION,
  ACCOUNT_DELETE_CONFIRM_ACTION_TYPE_HERE,
  ACCOUNT_DELETE_CONFIRM_BODY_1,
  ACCOUNT_DELETE_CONFIRM_BODY_2,
  ACCOUNT_DELETE_CONFIRM_CANCEL,
  ACCOUNT_DELETE_CONFIRM_TITLE,
  VOICE_DELETE_BUTTON,
  VOICE_DELETE_CONFIRM_ACTION,
  VOICE_DELETE_CONFIRM_BODY,
  VOICE_DELETE_CONFIRM_CANCEL,
  VOICE_DELETE_CONFIRM_TITLE,
  VOICE_DELETE_DONE_NONE,
  VOICE_DELETE_DONE_TEMPLATE,
} from "./copy.js";

type Phase = "idle" | "voice-confirm" | "account-confirm" | "submitting" | "done-voice" | "error";

export function DataActions(props: { voiceCount: number; canDeleteVoice: boolean }): ReactElement {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [voiceDeletedCount, setVoiceDeletedCount] = useState<number | null>(null);
  const [accountConfirmText, setAccountConfirmText] = useState("");

  async function deleteVoice(): Promise<void> {
    setPhase("submitting");
    try {
      const res = await fetch("/api/data/voice", { method: "DELETE" });
      if (!res.ok) {
        setErrorMessage(`Couldn't remove voice transcripts (status ${res.status}).`);
        setPhase("error");
        return;
      }
      const body = (await res.json()) as { deleted: number };
      setVoiceDeletedCount(body.deleted);
      setPhase("done-voice");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  async function deleteAccount(): Promise<void> {
    setPhase("submitting");
    try {
      const res = await fetch("/api/data/account", { method: "DELETE" });
      if (!res.ok) {
        setErrorMessage(`Couldn't close the account (status ${res.status}).`);
        setPhase("error");
        return;
      }
      window.location.href = "/auth/signin";
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <button
          type="button"
          disabled={!props.canDeleteVoice || phase === "submitting"}
          onClick={() => setPhase("voice-confirm")}
          style={{
            padding: "0.55rem 1rem",
            background: "#444",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: props.canDeleteVoice ? "pointer" : "not-allowed",
            opacity: props.canDeleteVoice ? 1 : 0.5,
          }}
        >
          {VOICE_DELETE_BUTTON}
        </button>
        <button
          type="button"
          disabled={phase === "submitting"}
          onClick={() => setPhase("account-confirm")}
          style={{
            padding: "0.55rem 1rem",
            background: "#a02c2c",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {ACCOUNT_DELETE_BUTTON}
        </button>
      </div>

      {phase === "voice-confirm" && (
        <ConfirmCard
          title={VOICE_DELETE_CONFIRM_TITLE}
          body={VOICE_DELETE_CONFIRM_BODY}
          confirmLabel={VOICE_DELETE_CONFIRM_ACTION}
          cancelLabel={VOICE_DELETE_CONFIRM_CANCEL}
          onConfirm={() => void deleteVoice()}
          onCancel={() => setPhase("idle")}
        />
      )}

      {phase === "account-confirm" && (
        <div
          role="dialog"
          aria-labelledby="acct-confirm-title"
          style={{
            border: "2px solid #a02c2c",
            background: "#fff8f8",
            padding: "1rem",
            borderRadius: 8,
          }}
        >
          <h3 id="acct-confirm-title" style={{ marginTop: 0 }}>
            {ACCOUNT_DELETE_CONFIRM_TITLE}
          </h3>
          <p style={{ color: "#444" }}>{ACCOUNT_DELETE_CONFIRM_BODY_1}</p>
          <p style={{ color: "#444" }}>{ACCOUNT_DELETE_CONFIRM_BODY_2}</p>
          <label
            htmlFor="acct-confirm-input"
            style={{ display: "block", marginTop: "0.75rem", fontSize: "0.95rem", color: "#555" }}
          >
            {ACCOUNT_DELETE_CONFIRM_ACTION_TYPE_HERE}
          </label>
          <input
            id="acct-confirm-input"
            type="text"
            value={accountConfirmText}
            onChange={(e) => setAccountConfirmText(e.target.value)}
            style={{
              padding: "0.4rem 0.6rem",
              border: "1px solid #ccc",
              borderRadius: 4,
              width: "100%",
              maxWidth: 240,
              marginTop: "0.25rem",
            }}
          />
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              type="button"
              disabled={accountConfirmText !== "DELETE"}
              onClick={() => void deleteAccount()}
              style={{
                padding: "0.5rem 0.9rem",
                background: accountConfirmText === "DELETE" ? "#a02c2c" : "#bbb",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: accountConfirmText === "DELETE" ? "pointer" : "not-allowed",
              }}
            >
              {ACCOUNT_DELETE_CONFIRM_ACTION}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setAccountConfirmText("");
              }}
              style={{
                padding: "0.5rem 0.9rem",
                background: "white",
                border: "1px solid #ccc",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {ACCOUNT_DELETE_CONFIRM_CANCEL}
            </button>
          </div>
        </div>
      )}

      {phase === "done-voice" && (
        <p role="status" style={{ color: "#1a7a3e" }}>
          {voiceDeletedCount && voiceDeletedCount > 0
            ? VOICE_DELETE_DONE_TEMPLATE(voiceDeletedCount)
            : VOICE_DELETE_DONE_NONE}
        </p>
      )}

      {phase === "error" && errorMessage && (
        <p role="alert" style={{ color: "#a02c2c" }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function ConfirmCard(props: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <div
      role="dialog"
      aria-labelledby="voice-confirm-title"
      style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: 8 }}
    >
      <h3 id="voice-confirm-title" style={{ marginTop: 0 }}>
        {props.title}
      </h3>
      <p style={{ color: "#444" }}>{props.body}</p>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
        <button
          type="button"
          onClick={props.onConfirm}
          style={{
            padding: "0.5rem 0.9rem",
            background: "#444",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {props.confirmLabel}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          style={{
            padding: "0.5rem 0.9rem",
            background: "white",
            border: "1px solid #ccc",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {props.cancelLabel}
        </button>
      </div>
    </div>
  );
}

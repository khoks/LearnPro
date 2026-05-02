"use client";

import type { OnboardingMessage, OnboardingTurnResponse } from "@learnpro/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendUserMessage,
  assistantTurnCount,
  parseTurnResponse,
  SEED_GREETING,
  SKIP_USER_MESSAGE,
  STEP_TOTAL,
} from "../../lib/onboarding-state";

interface SubmitState {
  status: "idle" | "submitting" | "error";
  errorMessage?: string;
}

const ROUTE_DELAY_MS = 1200;

export function OnboardingClient() {
  const [messages, setMessages] = useState<OnboardingMessage[]>([SEED_GREETING]);
  const [input, setInput] = useState("");
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const [done, setDone] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the message list to the latest bubble after each render.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // When the agent says we're done, route to /dashboard after a brief delay so the user can read
  // the close-out message.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      window.location.assign("/dashboard");
    }, ROUTE_DELAY_MS);
    return () => clearTimeout(t);
  }, [done]);

  const applyTurnResponse = useCallback((response: OnboardingTurnResponse) => {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: response.assistant_message },
    ]);
    setSubmit({ status: "idle" });
    if (response.done) setDone(true);
  }, []);

  const sendTurn = useCallback(
    async (nextMessages: OnboardingMessage[]) => {
      setSubmit({ status: "submitting" });
      try {
        const res = await fetch("/api/onboarding/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        });
        const json = (await res.json().catch(() => null)) as unknown;

        if (!res.ok) {
          const friendly =
            res.status === 429
              ? "We've hit today's chat budget — let's continue tomorrow. Heading to your dashboard."
              : res.status === 503
                ? "The onboarding coach is briefly unavailable. You can skip ahead any time."
                : "Something went wrong. Try again, or click Start now to skip.";
          if (res.status === 429) {
            setMessages((prev) => [...prev, { role: "assistant", content: friendly }]);
            setDone(true);
            setSubmit({ status: "idle" });
            return;
          }
          setSubmit({ status: "error", errorMessage: friendly });
          return;
        }

        const parsed = parseTurnResponse(json);
        if (!parsed) {
          setSubmit({
            status: "error",
            errorMessage: "Couldn't parse the coach's reply — try again.",
          });
          return;
        }
        applyTurnResponse(parsed);
      } catch {
        setSubmit({
          status: "error",
          errorMessage: "Network error. Check your connection and try again.",
        });
      }
    },
    [applyTurnResponse],
  );

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || submit.status === "submitting" || done) return;
    const nextMessages = appendUserMessage(messages, trimmed);
    setMessages(nextMessages);
    setInput("");
    await sendTurn(nextMessages);
  }, [input, submit.status, done, messages, sendTurn]);

  const onSkip = useCallback(async () => {
    if (submit.status === "submitting" || done) return;
    const nextMessages = appendUserMessage(messages, SKIP_USER_MESSAGE);
    setMessages(nextMessages);
    setInput("");
    await sendTurn(nextMessages);
  }, [submit.status, done, messages, sendTurn]);

  const step = Math.min(assistantTurnCount(messages), STEP_TOTAL);
  const submitting = submit.status === "submitting";

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <div
        ref={listRef}
        aria-live="polite"
        aria-label="Onboarding conversation"
        style={{
          maxHeight: 420,
          overflowY: "auto",
          border: "1px solid #ddd",
          borderRadius: 6,
          padding: "0.75rem",
          background: "#fafafa",
          display: "grid",
          gap: "0.5rem",
        }}
      >
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {submitting && (
          <div style={{ color: "#888", fontStyle: "italic" }}>The coach is typing…</div>
        )}
      </div>

      {submit.status === "error" && submit.errorMessage && (
        <div
          role="alert"
          style={{
            padding: "0.6rem 0.75rem",
            background: "#fee",
            border: "1px solid #f99",
            borderRadius: 4,
            color: "#a00",
          }}
        >
          {submit.errorMessage}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
        style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={submitting || done}
          placeholder="Type your reply…"
          aria-label="Reply to the onboarding coach"
          style={{
            flex: 1,
            padding: "0.55rem 0.7rem",
            border: "1px solid #bbb",
            borderRadius: 4,
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={submitting || done || input.trim().length === 0}
          aria-busy={submitting}
          style={{
            padding: "0.5rem 1rem",
            background: submitting || done ? "#888" : "#0a7",
            color: "white",
            border: "none",
            borderRadius: 4,
            fontWeight: 600,
            cursor: submitting || done ? "wait" : "pointer",
          }}
        >
          {submitting ? "Sending…" : "Send"}
        </button>
      </form>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 13,
          color: "#666",
        }}
      >
        <span>
          Step {step} / {STEP_TOTAL}
        </span>
        <button
          type="button"
          onClick={() => void onSkip()}
          disabled={submitting || done}
          aria-label="Skip onboarding and go to dashboard"
          style={{
            background: "none",
            border: "none",
            color: "#0066cc",
            cursor: submitting || done ? "wait" : "pointer",
            textDecoration: "underline",
            fontSize: 13,
            padding: 0,
          }}
        >
          Start now (skip)
        </button>
      </div>
    </section>
  );
}

function Bubble({ message }: { message: OnboardingMessage }) {
  const isAssistant = message.role === "assistant";
  return (
    <div
      style={{
        alignSelf: isAssistant ? "flex-start" : "flex-end",
        maxWidth: "80%",
        padding: "0.55rem 0.75rem",
        background: isAssistant ? "#fff" : "#0a7",
        color: isAssistant ? "#222" : "white",
        border: isAssistant ? "1px solid #ddd" : "none",
        borderRadius: 8,
        fontSize: 14,
        lineHeight: 1.45,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {message.content}
    </div>
  );
}

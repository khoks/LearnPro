"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { SandboxLanguage, SandboxRunResponse } from "@learnpro/sandbox";
import { runSandbox, type RunSandboxResult } from "../../lib/run-sandbox";
import { statusFor } from "./status";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 360,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e1e1e",
        color: "#aaa",
        fontFamily: "monospace",
      }}
    >
      Loading editor…
    </div>
  ),
});

const STARTERS: Record<SandboxLanguage, string> = {
  python: "print('hello from python')\n",
  typescript: "console.log('hello from typescript')\n",
};

const MONACO_LANGUAGE: Record<SandboxLanguage, string> = {
  python: "python",
  typescript: "typescript",
};

export function PlaygroundClient() {
  const [language, setLanguage] = useState<SandboxLanguage>("python");
  const [code, setCode] = useState<string>(STARTERS.python);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunSandboxResult | null>(null);

  const onLanguageChange = useCallback((next: SandboxLanguage) => {
    setLanguage(next);
    setCode(STARTERS[next]);
    setResult(null);
  }, []);

  const onRun = useCallback(async () => {
    setRunning(true);
    setResult(null);
    const r = await runSandbox({ language, code });
    setResult(r);
    setRunning(false);
  }, [language, code]);

  const status = useMemo(() => statusFor(result), [result]);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <label htmlFor="lang-select" style={{ fontWeight: 600 }}>
          Language
        </label>
        <select
          id="lang-select"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as SandboxLanguage)}
          disabled={running}
          style={{ padding: "0.4rem 0.6rem" }}
        >
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
        </select>
        <button
          type="button"
          onClick={onRun}
          disabled={running || code.trim().length === 0}
          aria-busy={running}
          style={{
            padding: "0.5rem 1rem",
            background: running ? "#888" : "#0a7",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: running ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {running ? "Running…" : "Run"}
        </button>
        <span aria-live="polite" style={{ color: status.color, fontWeight: 600 }}>
          {status.label}
        </span>
      </div>

      <div
        style={{ border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}
        aria-label="Code editor"
      >
        <Editor
          height="360px"
          language={MONACO_LANGUAGE[language]}
          value={code}
          theme="vs-dark"
          onChange={(v) => setCode(v ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            tabFocusMode: false,
            ariaLabel: "Code editor",
          }}
        />
      </div>

      <ResultPanel result={result} running={running} />
    </div>
  );
}

function ResultPanel({ result, running }: { result: RunSandboxResult | null; running: boolean }) {
  if (running) {
    return (
      <section aria-live="polite" style={{ color: "#666" }}>
        Running in sandbox…
      </section>
    );
  }
  if (result === null) {
    return (
      <section aria-live="polite" style={{ color: "#888" }}>
        Result will appear here after you press Run.
      </section>
    );
  }

  if (!result.ok) {
    return (
      <section
        aria-live="polite"
        style={{
          padding: "0.75rem",
          background: "#fee",
          border: "1px solid #f99",
          borderRadius: 4,
        }}
      >
        <strong>Run failed</strong>
        <div>
          <code>{result.error}</code>
          {result.message ? ` — ${result.message}` : ""}
        </div>
      </section>
    );
  }

  const r = result.result;
  return (
    <section aria-live="polite" style={{ display: "grid", gap: "0.5rem" }}>
      <Meta r={r} />
      <Block label="stdout" value={r.stdout} emptyHint="(no stdout)" />
      <Block label="stderr" value={r.stderr} emptyHint="(no stderr)" tone="warn" />
    </section>
  );
}

function Meta({ r }: { r: SandboxRunResponse }) {
  const fields: { k: string; v: string | number | null }[] = [
    { k: "language", v: r.language },
    { k: "runtime", v: r.runtime_version ?? "?" },
    { k: "exit_code", v: r.exit_code },
    { k: "duration_ms", v: r.duration_ms },
    { k: "killed_by", v: r.killed_by },
  ];
  return (
    <ul
      style={{
        display: "flex",
        gap: "1rem",
        padding: 0,
        margin: 0,
        listStyle: "none",
        flexWrap: "wrap",
        fontSize: 13,
        color: "#333",
      }}
    >
      {fields.map((f) => (
        <li key={f.k}>
          <strong>{f.k}:</strong> <code>{f.v === null ? "null" : String(f.v)}</code>
        </li>
      ))}
    </ul>
  );
}

function Block({
  label,
  value,
  emptyHint,
  tone,
}: {
  label: string;
  value: string;
  emptyHint: string;
  tone?: "warn";
}) {
  const trimmed = value ?? "";
  const isEmpty = trimmed.length === 0;
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{label}</div>
      <pre
        style={{
          margin: 0,
          padding: "0.5rem",
          background: tone === "warn" ? "#fff8e1" : "#f6f6f6",
          border: "1px solid #ddd",
          borderRadius: 4,
          fontSize: 13,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 240,
          overflow: "auto",
        }}
      >
        {isEmpty ? emptyHint : trimmed}
      </pre>
    </div>
  );
}

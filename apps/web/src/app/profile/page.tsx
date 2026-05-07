import { listCheatsheetsForUser, type CheatsheetView } from "@learnpro/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../auth/auth.js";
import { getAuthDb } from "../../auth/db.js";
import { CheatsheetTab } from "../session/CheatsheetTab";

export const dynamic = "force-dynamic";

// STORY-041 — `/profile` lists the user's all-time cheatsheet history. Each row links to
// `/profile?id=<uuid>`, and the same page renders the selected cheatsheet inline using
// `<CheatsheetTab>` (the same in-app editor + PDF export the session-recap page uses).
//
// The page is a server component — we read straight from `@learnpro/db`'s
// `listCheatsheetsForUser` helper instead of round-tripping through /api/cheatsheet so the
// initial render has the data inline. The interactive parts (edit, export) live in the
// already-existing `<CheatsheetTab>` client component, hydrated from `initialCheatsheet`.

interface ProfilePageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  const sp = await searchParams;
  const selectedId = sp.id ?? null;

  const db = getAuthDb();
  const cheatsheets = await listCheatsheetsForUser(db, {
    user_id: session.user.id,
    limit: 50,
  });
  const selected =
    selectedId !== null ? cheatsheets.find((c) => c.id === selectedId) ?? null : null;

  return (
    <main
      id="main-content"
      style={{
        padding: "1.25rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Your profile</h1>
        <p style={{ margin: "0.5rem 0 0", color: "#555", fontSize: 14 }}>
          Re-read what stuck. Each cheatsheet is a snapshot of one of your sessions — keep
          them, edit them, print them.
        </p>
      </header>

      <section
        aria-label="Cheatsheet history"
        style={{
          display: "grid",
          gridTemplateColumns: cheatsheets.length === 0 ? "1fr" : "minmax(220px, 280px) 1fr",
          gap: "1.5rem",
        }}
      >
        <CheatsheetList items={cheatsheets} selectedId={selectedId} />
        <div>
          {selected ? (
            <CheatsheetTab
              episodeIds={selected.episodes_covered}
              initialCheatsheet={toClientShape(selected)}
            />
          ) : (
            <EmptyState hasAny={cheatsheets.length > 0} />
          )}
        </div>
      </section>
    </main>
  );
}

function CheatsheetList({
  items,
  selectedId,
}: {
  items: ReadonlyArray<CheatsheetView>;
  selectedId: string | null;
}) {
  if (items.length === 0) {
    return (
      <aside style={{ color: "#666", fontSize: 14 }}>
        Nothing in your archive yet — finish a session and a cheatsheet shows up here.
      </aside>
    );
  }
  return (
    <aside aria-label="Saved cheatsheets">
      <h2 style={{ fontSize: 14, color: "#666", margin: "0 0 0.5rem", fontWeight: 600 }}>
        Saved cheatsheets
      </h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((c) => {
          const isSelected = c.id === selectedId;
          const date = c.created_at.toISOString().slice(0, 10);
          const title =
            c.entries.length > 0
              ? c.entries[0]?.concept ?? `Session — ${date}`
              : `Session — ${date}`;
          return (
            <li
              key={c.id}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: 4,
                marginBottom: 4,
                background: isSelected ? "#f0f7f4" : "transparent",
                border: isSelected ? "1px solid #0a7" : "1px solid transparent",
              }}
            >
              <Link
                href={`/profile?id=${encodeURIComponent(c.id)}`}
                style={{ textDecoration: "none", color: "#222", display: "block" }}
              >
                <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
                <div style={{ fontSize: 12, color: "#777" }}>
                  {date} · {c.entries.length}{" "}
                  {c.entries.length === 1 ? "entry" : "entries"}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  if (!hasAny) {
    return (
      <p style={{ color: "#666", fontSize: 14 }}>
        Once you finish a session, a fresh cheatsheet lands here automatically.
      </p>
    );
  }
  return (
    <p style={{ color: "#666", fontSize: 14 }}>
      Pick a cheatsheet on the left to view, edit, or export it.
    </p>
  );
}

function toClientShape(view: CheatsheetView): {
  id: string;
  episodes_covered: string[];
  entries: typeof view.entries;
  markdown_content: string;
  created_at: string;
  updated_at: string;
} {
  return {
    id: view.id,
    episodes_covered: view.episodes_covered,
    entries: view.entries,
    markdown_content: view.markdown_content,
    created_at: view.created_at.toISOString(),
    updated_at: view.updated_at.toISOString(),
  };
}

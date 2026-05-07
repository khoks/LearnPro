import {
  DAILY_DIGEST_SUBJECT,
  EMPTY_DAILY_BODY,
  UNSUBSCRIBE_FOOTER,
  UNSUBSCRIBE_LINK_TEXT,
} from "../copy.js";

// STORY-045 — Daily digest builder. Pure function (no DB / no transport / no crypto). The cron
// glue is responsible for fetching the inputs and calling this. Output is a `{ subject, html,
// text }` triple the EmailChannel forwards verbatim (subject → input.title; html/text →
// metadata.email_html / metadata.email_text).
//
// The HTML is hand-written, table-based, inlined-style. We considered MJML but it adds a
// runtime template-compile step that doesn't carry its weight for two static templates. A
// future Story can swap in MJML if we add more email types — the builder's signature stays
// the same.

export interface DailyDigestEpisode {
  problem_slug: string;
  problem_name: string;
  // "passed" | "passed_with_hints" | "failed" | "abandoned" | "revealed" — accepts null for
  // episodes that finished without an outcome (race; treated like "abandoned").
  final_outcome: string | null;
  hints_used: number;
  time_to_solve_ms: number | null;
}

export interface DailyDigestPlanItem {
  slug: string;
  objective: string;
  estimated_duration_min: number;
  // Defaults to "pending"; completed items in today's plan get filtered out by the caller.
  status?: "pending" | "completed";
}

export interface DailyDigestInput {
  // The user's display name (or null if not set; email greeting falls back to "Hi there,").
  user_name: string | null;
  // The previous calendar day, formatted YYYY-MM-DD. Used in the "Yesterday (DATE):" header.
  yesterday_label: string;
  // Today's date label, used in the "Today (DATE):" plan section header.
  today_label: string;
  // Yesterday's finished episodes — closes-of-business-day for the daily window.
  yesterday_episodes: DailyDigestEpisode[];
  // Today's pending session-plan items (from STORY-015's session_plans).
  today_plan_items: DailyDigestPlanItem[];
  // Recommended difficulty hint — surfaced when the difficulty tuner has flipped a step.
  // Pure-text suggestion; null when no hint applies.
  difficulty_hint: string | null;
  // Absolute URL the unsubscribe link points to. The cron stamps the per-user token in.
  unsubscribe_url: string;
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

export function buildDailyDigest(input: DailyDigestInput): RenderedDigest {
  const greeting = input.user_name ? `Hi ${input.user_name},` : "Hi there,";
  const passedCount = input.yesterday_episodes.filter((e) => isPass(e.final_outcome)).length;
  const totalCount = input.yesterday_episodes.length;
  const pendingPlan = input.today_plan_items.filter((p) => p.status !== "completed");

  const text = renderText({
    greeting,
    passedCount,
    totalCount,
    yesterdayLabel: input.yesterday_label,
    todayLabel: input.today_label,
    episodes: input.yesterday_episodes,
    planItems: pendingPlan,
    difficultyHint: input.difficulty_hint,
    unsubscribeUrl: input.unsubscribe_url,
  });
  const html = renderHtml({
    greeting,
    passedCount,
    totalCount,
    yesterdayLabel: input.yesterday_label,
    todayLabel: input.today_label,
    episodes: input.yesterday_episodes,
    planItems: pendingPlan,
    difficultyHint: input.difficulty_hint,
    unsubscribeUrl: input.unsubscribe_url,
  });

  return {
    subject: DAILY_DIGEST_SUBJECT,
    html,
    text,
  };
}

function isPass(outcome: string | null): boolean {
  return outcome === "passed" || outcome === "passed_with_hints";
}

interface RenderInput {
  greeting: string;
  passedCount: number;
  totalCount: number;
  yesterdayLabel: string;
  todayLabel: string;
  episodes: DailyDigestEpisode[];
  planItems: DailyDigestPlanItem[];
  difficultyHint: string | null;
  unsubscribeUrl: string;
}

function renderText(r: RenderInput): string {
  const lines: string[] = [];
  lines.push(r.greeting, "");
  if (r.totalCount === 0) {
    lines.push(EMPTY_DAILY_BODY, "");
  } else {
    lines.push(`Yesterday (${r.yesterdayLabel}): ${summarize(r.passedCount, r.totalCount)}`);
    for (const ep of r.episodes) {
      lines.push(`  - ${ep.problem_name}: ${describeOutcome(ep)}`);
    }
    lines.push("");
  }
  if (r.planItems.length > 0) {
    lines.push(`Today (${r.todayLabel}):`);
    for (const item of r.planItems) {
      lines.push(`  - ${item.objective} (~${item.estimated_duration_min} min)`);
    }
    lines.push("");
  }
  if (r.difficultyHint) {
    lines.push(`Suggested difficulty: ${r.difficultyHint}`, "");
  }
  lines.push("---", UNSUBSCRIBE_FOOTER, `${UNSUBSCRIBE_LINK_TEXT}: ${r.unsubscribeUrl}`);
  return lines.join("\n");
}

function renderHtml(r: RenderInput): string {
  const safeGreeting = escapeHtml(r.greeting);
  const safeUnsub = escapeAttr(r.unsubscribeUrl);
  const yesterdaySection =
    r.totalCount === 0
      ? `<p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.5;">${escapeHtml(EMPTY_DAILY_BODY)}</p>`
      : renderYesterdayHtml(r);
  const todaySection = renderTodayHtml(r);
  const hintSection = r.difficultyHint
    ? `<p style="margin:16px 0 0;color:#444;font-size:14px;line-height:1.5;"><strong>Suggested difficulty:</strong> ${escapeHtml(
        r.difficultyHint,
      )}</p>`
    : "";

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,system-ui,Segoe UI,sans-serif;background:#f7f7f8;color:#222;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f8;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eee;">
<tr><td>
<h1 style="margin:0 0 8px;font-size:18px;color:#222;">Your daily LearnPro digest</h1>
<p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.5;">${safeGreeting}</p>
${yesterdaySection}
${todaySection}
${hintSection}
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#777;">${escapeHtml(UNSUBSCRIBE_FOOTER)}<br><a href="${safeUnsub}" style="color:#3a82f7;">${escapeHtml(UNSUBSCRIBE_LINK_TEXT)}</a></p>
</td></tr>
</table>
</body>
</html>`;
}

function renderYesterdayHtml(r: RenderInput): string {
  const items = r.episodes
    .map((ep) => {
      const detail = describeOutcome(ep);
      return `<li style="margin:0 0 6px;color:#333;font-size:14px;line-height:1.5;"><strong>${escapeHtml(
        ep.problem_name,
      )}</strong> &mdash; ${escapeHtml(detail)}</li>`;
    })
    .join("");
  return `<h2 style="margin:16px 0 8px;font-size:15px;color:#333;">Yesterday (${escapeHtml(r.yesterdayLabel)})</h2>
<p style="margin:0 0 8px;color:#444;font-size:14px;line-height:1.5;">${escapeHtml(summarize(r.passedCount, r.totalCount))}</p>
<ul style="padding-left:20px;margin:0 0 16px;">${items}</ul>`;
}

function renderTodayHtml(r: RenderInput): string {
  if (r.planItems.length === 0) return "";
  const items = r.planItems
    .map(
      (item) =>
        `<li style="margin:0 0 6px;color:#333;font-size:14px;line-height:1.5;">${escapeHtml(
          item.objective,
        )} <span style="color:#777;">(~${item.estimated_duration_min} min)</span></li>`,
    )
    .join("");
  return `<h2 style="margin:16px 0 8px;font-size:15px;color:#333;">Today (${escapeHtml(r.todayLabel)})</h2>
<ul style="padding-left:20px;margin:0 0 16px;">${items}</ul>`;
}

function summarize(passed: number, total: number): string {
  if (total === 0) return "No problems closed.";
  if (passed === total) {
    return total === 1 ? "1 problem solved." : `${total} problems solved.`;
  }
  return `${passed} of ${total} solved.`;
}

function describeOutcome(ep: DailyDigestEpisode): string {
  switch (ep.final_outcome) {
    case "passed":
      return ep.hints_used > 0 ? `passed with ${ep.hints_used} hint(s)` : "passed";
    case "passed_with_hints":
      return `passed with ${ep.hints_used} hint(s)`;
    case "failed":
      return "didn't pass yet";
    case "abandoned":
      return "set aside for later";
    case "revealed":
      return "solution revealed";
    default:
      return "in progress";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

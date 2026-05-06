import {
  EMPTY_WEEKLY_BODY,
  UNSUBSCRIBE_FOOTER,
  UNSUBSCRIBE_LINK_TEXT,
  WEEKLY_DIGEST_SUBJECT,
} from "../copy.js";

// STORY-045 — Weekly digest builder. Pure function, same shape as the daily builder.
//
// Inputs:
//   - week_episodes:        episodes finished in the past 7 days
//   - mastery_deltas:       concept-confidence change snapshot (provided by the cron via the
//                           skill_scores read; we don't compute deltas inside the builder).
//   - skill_snapshot:       top-N concepts by confidence (already capped at 8 by the read).
//   - hours_practiced:      sum of time_to_solve_ms across week_episodes, in hours (rounded
//                           to 1 decimal place).
//
// The output renders three sections: "This week", "Skill snapshot", "What's next" (suggested
// next track). The suggestion is a deterministic free-text string; the cron passes whatever
// the recommendation engine returned (or null when no suggestion is available).

export interface WeeklyDigestEpisode {
  problem_slug: string;
  problem_name: string;
  final_outcome: string | null;
  hints_used: number;
  time_to_solve_ms: number | null;
}

export interface WeeklyDigestSkillSnapshotRow {
  concept_name: string;
  confidence: number;
}

export interface WeeklyDigestMasteryDelta {
  concept_name: string;
  // The change in `confidence` over the 7-day window. Negative values are tolerated but the
  // builder only renders deltas >= +1 to keep the email focused on progress (no shame).
  delta: number;
}

export interface WeeklyDigestInput {
  user_name: string | null;
  // Inclusive start of the window (YYYY-MM-DD).
  week_start_label: string;
  // Inclusive end (YYYY-MM-DD).
  week_end_label: string;
  week_episodes: WeeklyDigestEpisode[];
  // Concepts whose confidence increased in the window.
  mastery_deltas: WeeklyDigestMasteryDelta[];
  skill_snapshot: WeeklyDigestSkillSnapshotRow[];
  hours_practiced: number;
  // Cron passes the recommendation engine's "next track" string, or null when none applies.
  next_step_hint: string | null;
  unsubscribe_url: string;
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

export function buildWeeklyDigest(input: WeeklyDigestInput): RenderedDigest {
  const greeting = input.user_name ? `Hi ${input.user_name},` : "Hi there,";
  const closedCount = input.week_episodes.filter((e) => isClose(e.final_outcome)).length;
  const passedCount = input.week_episodes.filter((e) => isPass(e.final_outcome)).length;
  const positiveDeltas = input.mastery_deltas.filter((d) => d.delta >= 1);

  const text = renderText({
    greeting,
    closedCount,
    passedCount,
    weekStartLabel: input.week_start_label,
    weekEndLabel: input.week_end_label,
    hoursPracticed: input.hours_practiced,
    masteryDeltas: positiveDeltas,
    skillSnapshot: input.skill_snapshot,
    nextStepHint: input.next_step_hint,
    unsubscribeUrl: input.unsubscribe_url,
  });
  const html = renderHtml({
    greeting,
    closedCount,
    passedCount,
    weekStartLabel: input.week_start_label,
    weekEndLabel: input.week_end_label,
    hoursPracticed: input.hours_practiced,
    masteryDeltas: positiveDeltas,
    skillSnapshot: input.skill_snapshot,
    nextStepHint: input.next_step_hint,
    unsubscribeUrl: input.unsubscribe_url,
  });

  return {
    subject: WEEKLY_DIGEST_SUBJECT,
    html,
    text,
  };
}

function isPass(outcome: string | null): boolean {
  return outcome === "passed" || outcome === "passed_with_hints";
}

function isClose(outcome: string | null): boolean {
  return outcome !== null;
}

interface RenderInput {
  greeting: string;
  closedCount: number;
  passedCount: number;
  weekStartLabel: string;
  weekEndLabel: string;
  hoursPracticed: number;
  masteryDeltas: WeeklyDigestMasteryDelta[];
  skillSnapshot: WeeklyDigestSkillSnapshotRow[];
  nextStepHint: string | null;
  unsubscribeUrl: string;
}

function renderText(r: RenderInput): string {
  const lines: string[] = [];
  lines.push(r.greeting, "");
  lines.push(`Week of ${r.weekStartLabel} to ${r.weekEndLabel}`, "");
  if (r.closedCount === 0) {
    lines.push(EMPTY_WEEKLY_BODY, "");
  } else {
    lines.push(
      `Closed ${r.closedCount} problem${r.closedCount === 1 ? "" : "s"} (${r.passedCount} solved).`,
    );
    lines.push(`Total practice time: ${r.hoursPracticed.toFixed(1)} hours.`);
    lines.push("");
  }
  if (r.masteryDeltas.length > 0) {
    lines.push("Concepts that grew this week:");
    for (const d of r.masteryDeltas) {
      lines.push(`  - ${d.concept_name} (+${d.delta} confidence)`);
    }
    lines.push("");
  }
  if (r.skillSnapshot.length > 0) {
    lines.push("Top concepts right now:");
    for (const s of r.skillSnapshot) {
      lines.push(`  - ${s.concept_name}: ${s.confidence}/100`);
    }
    lines.push("");
  }
  if (r.nextStepHint) {
    lines.push(`What's next: ${r.nextStepHint}`, "");
  }
  lines.push("---", UNSUBSCRIBE_FOOTER, `${UNSUBSCRIBE_LINK_TEXT}: ${r.unsubscribeUrl}`);
  return lines.join("\n");
}

function renderHtml(r: RenderInput): string {
  const safeGreeting = escapeHtml(r.greeting);
  const safeUnsub = escapeAttr(r.unsubscribeUrl);

  const summarySection =
    r.closedCount === 0
      ? `<p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.5;">${escapeHtml(EMPTY_WEEKLY_BODY)}</p>`
      : `<p style="margin:0 0 8px;color:#333;font-size:14px;line-height:1.5;">Closed ${r.closedCount} problem${r.closedCount === 1 ? "" : "s"} (${r.passedCount} solved).</p>
<p style="margin:0 0 16px;color:#333;font-size:14px;line-height:1.5;">Total practice time: ${r.hoursPracticed.toFixed(1)} hours.</p>`;

  const masterySection =
    r.masteryDeltas.length > 0
      ? `<h2 style="margin:16px 0 8px;font-size:15px;color:#333;">Concepts that grew</h2>
<ul style="padding-left:20px;margin:0 0 16px;">${r.masteryDeltas
          .map(
            (d) =>
              `<li style="margin:0 0 6px;color:#333;font-size:14px;line-height:1.5;"><strong>${escapeHtml(
                d.concept_name,
              )}</strong> <span style="color:#0a7c4a;">(+${d.delta})</span></li>`,
          )
          .join("")}</ul>`
      : "";

  const skillSection =
    r.skillSnapshot.length > 0
      ? `<h2 style="margin:16px 0 8px;font-size:15px;color:#333;">Top concepts right now</h2>
<ul style="padding-left:20px;margin:0 0 16px;">${r.skillSnapshot
          .map(
            (s) =>
              `<li style="margin:0 0 6px;color:#333;font-size:14px;line-height:1.5;">${escapeHtml(
                s.concept_name,
              )}: <strong>${s.confidence}/100</strong></li>`,
          )
          .join("")}</ul>`
      : "";

  const hintSection = r.nextStepHint
    ? `<h2 style="margin:16px 0 8px;font-size:15px;color:#333;">What's next</h2>
<p style="margin:0 0 16px;color:#333;font-size:14px;line-height:1.5;">${escapeHtml(r.nextStepHint)}</p>`
    : "";

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,system-ui,Segoe UI,sans-serif;background:#f7f7f8;color:#222;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f8;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eee;">
<tr><td>
<h1 style="margin:0 0 8px;font-size:18px;color:#222;">Your weekly LearnPro digest</h1>
<p style="margin:0 0 4px;color:#777;font-size:13px;">Week of ${escapeHtml(r.weekStartLabel)} to ${escapeHtml(r.weekEndLabel)}</p>
<p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.5;">${safeGreeting}</p>
${summarySection}
${masterySection}
${skillSection}
${hintSection}
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#777;">${escapeHtml(UNSUBSCRIBE_FOOTER)}<br><a href="${safeUnsub}" style="color:#3a82f7;">${escapeHtml(UNSUBSCRIBE_LINK_TEXT)}</a></p>
</td></tr>
</table>
</body>
</html>`;
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

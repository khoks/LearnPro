#!/usr/bin/env bash
# Stop hook — block session end until the harvest-knowledge and work-tracking
# skills have run. Writes a per-session marker so the block fires at most once
# per session_id, and is a no-op when STOP_HOOK_ACTIVE=true to prevent loops.
#
# Portable across Git Bash on Windows, Mac, and Linux. No jq dependency.

set -euo pipefail

INPUT=$(cat)

# Collapse to single line for sed extraction.
ONE_LINE=$(printf '%s' "$INPUT" | tr '\n' ' ')

SESSION_ID=$(printf '%s' "$ONE_LINE" \
  | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

STOP_HOOK_ACTIVE=$(printf '%s' "$ONE_LINE" \
  | sed -n 's/.*"stop_hook_active"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p')

# Already inside a hook-driven continuation — don't re-block.
if [ "${STOP_HOOK_ACTIVE:-false}" = "true" ]; then
  exit 0
fi

SESSION_ID="${SESSION_ID:-unknown}"
MARKER_DIR=".claude/state"
MARKER_FILE="$MARKER_DIR/housekept-$SESSION_ID"

mkdir -p "$MARKER_DIR"

if [ -f "$MARKER_FILE" ]; then
  exit 0
fi

cat <<EOF
{
  "decision": "block",
  "reason": "Before ending this session, run two project skills in order:\n\n1. **harvest-knowledge** — sweep this conversation for any new vision items, feature ideas, architectural / performance / scaling / infrastructure / tech-stack decisions, novel or patentable ideas, and crucial product or engineering decisions. Update the matching docs: docs/vision/RECOMMENDED_ADDITIONS.md, docs/architecture/ARCHITECTURE.md or a new ADR, docs/decisions/DECISIONS_LOG.md, docs/vision/NOVEL_IDEAS.md. Skip only if the conversation introduced literally nothing new worth persisting — and say so explicitly.\n\n2. **work-tracking** — sweep this conversation for new requirements / scope changes / status changes affecting Epics, Stories, or Tasks. Create new items where needed (using project/TEMPLATES/), update statuses with activity-log entries, and refresh project/BOARD.md. Skip only if nothing changed — and say so.\n\nThen mark this session housekept so this hook stops blocking:\n\n  mkdir -p .claude/state && touch .claude/state/housekept-$SESSION_ID\n\nAnd attempt to stop again."
}
EOF

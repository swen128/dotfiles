#!/usr/bin/env bash
set -euo pipefail

PANE_ID="${1:-}"
CLAUDE_ARGS=(--dangerously-skip-permissions --teammate-mode in-process --fork-session)

session_id=""
if [[ -n "$PANE_ID" ]]; then
  map="$HOME/.claude/pane-sessions/$PANE_ID"
  [[ -f "$map" ]] && session_id=$(cat "$map")
fi

if [[ -n "$session_id" ]]; then
  claude "${CLAUDE_ARGS[@]}" --resume "$session_id"
else
  claude "${CLAUDE_ARGS[@]}" --continue
fi

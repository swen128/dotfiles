#!/usr/bin/env bash
set -euo pipefail

PANE_ID="${1:-}"
CLAUDE_ARGS=(--dangerously-skip-permissions --teammate-mode in-process --fork-session)
UNLEASH_SESSIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/unleash/sessions"

# Print the id of the unleash session running in the pane, if any. A live
# session's lock file holds "<pid> <token>"; the shallowest matching process
# under the pane wins, so subagents spawned by that session are ignored.
unleash_session_in_pane() {
  local pane_pid lock pid locks=""
  pane_pid=$(tmux display-message -p -t "$1" '#{pane_pid}') || return 0
  for lock in "$UNLEASH_SESSIONS_DIR"/*/lock; do
    [[ -f "$lock" ]] || continue
    read -r pid _ <"$lock" || continue
    [[ -n "$pid" ]] && locks+="$pid $(basename "$(dirname "$lock")")"$'\n'
  done
  [[ -n "$locks" ]] || return 0

  # Breadth-first walk of the pane's process tree.
  { printf '%s' "$locks"; echo "--"; ps -ax -o pid=,ppid=; } | awk -v root="$pane_pid" '
    !tree && $0 == "--" { tree = 1; next }
    !tree { session[$1] = $2; next }
    { children[$2] = children[$2] " " $1 }
    END {
      queue = root
      while (queue != "") {
        n = split(queue, pids, " ")
        for (i = 1; i <= n; i++) if (pids[i] in session) { print session[pids[i]]; exit }
        next_queue = ""
        for (i = 1; i <= n; i++) if (pids[i] in children) next_queue = next_queue children[pids[i]]
        queue = next_queue
      }
    }'
}

if [[ -n "$PANE_ID" ]]; then
  unleash_session=$(unleash_session_in_pane "$PANE_ID")
  if [[ -n "$unleash_session" ]]; then
    exec unleash --resume "$unleash_session" --fork-session
  fi
fi

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

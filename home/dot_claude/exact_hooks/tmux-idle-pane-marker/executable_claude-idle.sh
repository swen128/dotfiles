#!/usr/bin/env bash
IDLE_PANES_DIR="$HOME/.claude/idle-panes"
BUSY_SUBAGENTS_DIR="$HOME/.claude/busy-subagents"
[[ -d "$IDLE_PANES_DIR" ]] || exit 0

all_panes=$(tmux list-panes -a -F '#{pane_id}' 2>/dev/null)
for marker in "$IDLE_PANES_DIR"/*; do
  [[ -f "$marker" ]] || continue
  pane=$(basename "$marker")
  if ! printf '%s\n' "$all_panes" | grep -qxF "$pane"; then
    rm -f "$marker"
    rm -rf "$BUSY_SUBAGENTS_DIR/$pane"
  fi
done

for pane_id in $(tmux list-panes -t "$1" -F '#{pane_id}' 2>/dev/null); do
  [[ -f "$IDLE_PANES_DIR/$pane_id" ]] || continue
  [[ -z "$(ls -A "$BUSY_SUBAGENTS_DIR/$pane_id" 2>/dev/null)" ]] && printf ' *' && exit 0
done

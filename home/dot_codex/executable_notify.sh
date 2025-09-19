#!/bin/bash

json="${!#}"
msg=$(printf '%s' "$json" | jq -r '."last-assistant-message"')

osascript - "$msg" <<'OSA'
on run argv
  display notification item 1 of argv with title "Codex"
end run
OSA

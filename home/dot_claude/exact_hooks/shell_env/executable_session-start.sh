#!/bin/bash

if [ -n "$CLAUDE_ENV_FILE" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cat "$SCRIPT_DIR/env.sh" >> "$CLAUDE_ENV_FILE"
fi

exit 0

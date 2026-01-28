#!/bin/bash

# Show UI notifications only when Claude Code is started manually (not programatically)
if [ "$CLAUDE_CODE_ENTRYPOINT" = "cli" ]; then
    open -g raycast://confetti
fi

# Continue without blocking
exit 0

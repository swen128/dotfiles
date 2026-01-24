#!/bin/bash

# Read the JSON input from stdin
INPUT=$(cat)

# Extract transcript from the JSON
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript')

# Get project root from transcript
PROJECT_ROOT=$(echo "$TRANSCRIPT" | jq -r '.[0].env.working_directory // empty')

# Show UI notifications only when Claude Code is started manually (not programatically)
if [ "$CLAUDE_CODE_ENTRYPOINT" = "cli" ]; then
    open -g raycast://confetti
fi

# Check for project-specific hook
if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.claude.local/hooks/notification.sh" ]; then
    # Pass the input to the project-specific hook
    echo "$INPUT" | "$PROJECT_ROOT/.claude.local/hooks/notification.sh"
    exit $?
fi

# Continue without blocking
exit 0

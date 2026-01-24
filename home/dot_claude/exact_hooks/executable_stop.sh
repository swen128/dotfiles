#!/bin/bash

# Source function libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/transcript_parser.sh"
source "$SCRIPT_DIR/ng_checker.sh"

# Read the JSON input from stdin
INPUT=$(cat)

# Extract transcript path from the JSON
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path')

# Read the transcript from the file
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    TRANSCRIPT=$(cat "$TRANSCRIPT_PATH")
else
    TRANSCRIPT=""
fi

# Get project root from transcript
PROJECT_ROOT=$(get_project_root "$TRANSCRIPT")

# Show UI notifications only when Claude Code is started manually (not programatically)
if [ "$CLAUDE_CODE_ENTRYPOINT" = "cli" ]; then
    open -g raycast://confetti
fi

# Check for project-specific hook
if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.claude.local/hooks/stop.sh" ]; then
    # Pass the input to the project-specific hook
    echo "$INPUT" | "$PROJECT_ROOT/.claude.local/hooks/stop.sh"
    exit $?
fi

# Continue without blocking
exit 0

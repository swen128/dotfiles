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

# Get the last assistant message
LAST_MESSAGE=$(get_last_assistant_message "$TRANSCRIPT")

# Check for NG keywords if we have a message
if [ -n "$LAST_MESSAGE" ]; then
    check_ng_keywords "$LAST_MESSAGE"
    if [ $? -eq 2 ]; then
        exit 2
    fi
fi

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

#!/bin/bash

# Read the JSON input from stdin
INPUT=$(cat)

# Extract transcript from the JSON
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript')

# Get project root from transcript
PROJECT_ROOT=$(echo "$TRANSCRIPT" | jq -r '.[0].env.working_directory // empty')

# NG keywords to check for
NG_KEYWORDS=("efficient" "too long" "too large" "complex" "instead" "alternatively")

# Get the last assistant message
LAST_MESSAGE=$(echo "$TRANSCRIPT" | jq -r '[.[] | select(.role == "assistant" and .content != null)] | last | .content // empty')

# Check for NG keywords if we have a message
if [ -n "$LAST_MESSAGE" ]; then
    LOWER_MESSAGE=$(echo "$LAST_MESSAGE" | tr '[:upper:]' '[:lower:]')
    
    for keyword in "${NG_KEYWORDS[@]}"; do
        if [[ "$LOWER_MESSAGE" == *"$keyword"* ]]; then
            echo "Blocked: Assistant message contains NG keyword: $keyword" >&2
            echo "Please rephrase your request to be more specific." >&2
            exit 2
        fi
    done
fi

# Run confetti only when CLAUDE_CODE_ENTRYPOINT=cli
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
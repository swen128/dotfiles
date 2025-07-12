#!/bin/bash

# Read the JSON input from stdin
INPUT=$(cat)

# Extract transcript from the JSON
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript')

# Get project root from transcript
PROJECT_ROOT=$(echo "$TRANSCRIPT" | jq -r '.[0].env.working_directory // empty')

# Global subagent-stop hook actions
# This runs when a Task (subagent) completes

# Check for project-specific hook
if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.claude.local/hooks/subagent-stop.sh" ]; then
    # Pass the input to the project-specific hook
    echo "$INPUT" | "$PROJECT_ROOT/.claude.local/hooks/subagent-stop.sh"
    exit $?
fi

# Continue without blocking
exit 0
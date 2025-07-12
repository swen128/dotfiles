#!/bin/bash

# Read the JSON input from stdin
INPUT=$(cat)

# Extract data from the JSON
COMPACT_TYPE=$(echo "$INPUT" | jq -r '.compact_type') # "manual" or "auto"
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript')

# Get project root from transcript
PROJECT_ROOT=$(echo "$TRANSCRIPT" | jq -r '.[0].env.working_directory // empty')

# Global pre-compact checks
# You can add logic here to control when compacting is allowed
# For example, you might want to save state before compacting

# Check for project-specific hook
if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.claude.local/hooks/pre-compact.sh" ]; then
    # Pass the input to the project-specific hook
    echo "$INPUT" | "$PROJECT_ROOT/.claude.local/hooks/pre-compact.sh"
    exit $?
fi

# Allow the compact operation
exit 0
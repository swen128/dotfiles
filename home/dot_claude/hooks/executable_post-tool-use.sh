#!/bin/bash

# Read the JSON input from stdin
INPUT=$(cat)

# Extract data from the JSON
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')
TOOL_RESULT=$(echo "$INPUT" | jq -r '.tool_result')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript')

# Get project root from transcript
PROJECT_ROOT=$(echo "$TRANSCRIPT" | jq -r '.[0].env.working_directory // empty')

# Global post-tool-use actions can be added here
# For example, logging successful tool uses, checking for errors, etc.

# Check for project-specific hook
if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.claude.local/hooks/post-tool-use.sh" ]; then
    # Pass the input to the project-specific hook
    echo "$INPUT" | "$PROJECT_ROOT/.claude.local/hooks/post-tool-use.sh"
    exit $?
fi

# Continue without blocking
exit 0
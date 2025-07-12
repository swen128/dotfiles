#!/bin/bash

# Read the JSON input from stdin
INPUT=$(cat)

# Extract tool name and input from the JSON
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript')

# Get project root from transcript
PROJECT_ROOT=$(echo "$TRANSCRIPT" | jq -r '.[0].env.working_directory // empty')

# Global pre-tool-use checks
if [ "$TOOL_NAME" = "Bash" ]; then
    # Extract the command from tool input
    command=$(echo "$TOOL_INPUT" | jq -r '.command')
    
    # Check if the command contains both git and --no-verify
    if echo "$command" | grep -q 'git' && echo "$command" | grep -q -- '--no-verify'; then
        echo "Blocked: git commands with --no-verify flag are not allowed" >&2
        exit 2
    fi
fi

if [ "$TOOL_NAME" = "WebSearch" ]; then
    echo 'Use the command: gemini -p "search for <your search query>" instead of WebSearch.' >&2
    exit 2
fi

# Check for project-specific hook
if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.claude.local/hooks/pre-tool-use.sh" ]; then
    # Pass the input to the project-specific hook
    echo "$INPUT" | "$PROJECT_ROOT/.claude.local/hooks/pre-tool-use.sh"
    exit $?
fi

# Allow all other tool uses
exit 0
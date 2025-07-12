#!/bin/bash

# PreToolUse hook for Claude Code
# Blocks Bash commands that contain --no-verify flag

# Read the JSON input from stdin
INPUT=$(cat)

# Extract tool name and input from the JSON
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Check if the tool being used is Bash
if [ "$TOOL_NAME" = "Bash" ]; then
    # Extract the command from tool input
    command=$(echo "$TOOL_INPUT" | jq -r '.command')
    
    # Check if the command contains both git and --no-verify
    if echo "$command" | grep -q 'git' && echo "$command" | grep -q -- '--no-verify'; then
        # Output error message to stderr and exit with code 2 to block
        echo "Blocked: git commands with --no-verify flag are not allowed" >&2
        exit 2
    fi
fi

# Allow all other tool uses
exit 0


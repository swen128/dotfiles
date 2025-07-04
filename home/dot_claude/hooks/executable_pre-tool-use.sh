#!/bin/bash

# PreToolUse hook for Claude Code
# Blocks Bash commands that contain --no-verify flag

# Check if the tool being used is Bash
if [ "$CLAUDE_TOOL_NAME" = "Bash" ]; then
    # Extract the command
    command=$(echo "$CLAUDE_TOOL_INPUT" | jq -r '.command')
    
    # Check if the command contains both git and --no-verify
    if echo "$command" | grep -q 'git' && echo "$command" | grep -q -- '--no-verify'; then
        echo "Blocked: git commands with --no-verify flag are not allowed"
        exit 1
    fi
fi

# Allow all other tool uses
exit 0


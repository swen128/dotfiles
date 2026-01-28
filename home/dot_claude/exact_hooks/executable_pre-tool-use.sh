#!/bin/bash

# Source function libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ng_checker.sh"

# Read the JSON input from stdin
INPUT=$(cat)

# Extract tool name and input from the JSON
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Global pre-tool-use checks
if [ "$TOOL_NAME" = "Bash" ]; then
    # Extract the command from tool input
    command=$(echo "$TOOL_INPUT" | jq -r '.command')

    # Check for NG commands
    check_ng_commands "$command"
    if [ $? -eq 2 ]; then
        exit 2
    fi
fi

# Allow all other tool uses
exit 0

#!/bin/bash

# Source function libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/transcript_parser.sh"
source "$SCRIPT_DIR/ng_checker.sh"

# Read the JSON input from stdin
INPUT=$(cat)

# Extract tool name and input from the JSON
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path')

# Read the transcript from the file
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    TRANSCRIPT=$(cat "$TRANSCRIPT_PATH")
else
    TRANSCRIPT=""
fi

# Get project root from transcript
PROJECT_ROOT=$(get_project_root "$TRANSCRIPT")

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

# Special handling for WebSearch (not in ng_commands.json for backward compatibility)
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

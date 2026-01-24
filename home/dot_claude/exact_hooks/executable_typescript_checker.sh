#!/bin/bash

# TypeScript Anti-pattern Checker
# This script checks for common TypeScript anti-patterns in code

# Read the JSON input from stdin
INPUT=$(cat)

# Extract tool name and input
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Only check for Write, Edit, and MultiEdit tools
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "MultiEdit" ]]; then
    exit 0
fi

# Extract file path
FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty')

# Check if it's a TypeScript file
if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
    exit 0
fi

# Extract content based on tool type
if [[ "$TOOL_NAME" == "Write" ]]; then
    CONTENT=$(echo "$TOOL_INPUT" | jq -r '.content // empty')
elif [[ "$TOOL_NAME" == "Edit" ]]; then
    CONTENT=$(echo "$TOOL_INPUT" | jq -r '.new_string // empty')
elif [[ "$TOOL_NAME" == "MultiEdit" ]]; then
    # For MultiEdit, concatenate all new_string values
    CONTENT=$(echo "$TOOL_INPUT" | jq -r '.edits[]?.new_string // empty' | tr '\n' ' ')
fi

# Check for anti-patterns
WARNING=""
if echo "$CONTENT" | grep -q ' as '; then
    WARNING="${WARNING}⚠️  Never use 'as' type assertions in TypeScript. Fix it immediately.\n"
fi
if echo "$CONTENT" | grep -q ' is '; then
    WARNING="${WARNING}⚠️  Never use 'is' type predicates in TypeScript. Fix it immediately.\n"
fi
if echo "$CONTENT" | grep -q ' any'; then
    WARNING="${WARNING}⚠️  Never use 'any' type in TypeScript. Fix it immediately.\n"
fi

# Output warning if any anti-patterns found
if [ -n "$WARNING" ]; then
    # Use exit code 2 to ensure the AI sees the stderr output
    echo -e "\n$WARNING" >&2
    exit 2
fi

exit 0
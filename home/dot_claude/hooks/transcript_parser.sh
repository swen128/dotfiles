#!/bin/bash

# Functions for parsing Claude transcript data

# Get project root from transcript (JSONL format)
get_project_root() {
    local transcript="$1"
    echo "$transcript" | jq -s -r '.[0].env.working_directory // empty'
}

# Get last assistant message from transcript (JSONL format)
get_last_assistant_message() {
    local transcript="$1"
    echo "$transcript" | jq -s -r '[.[] | select(.message.role == "assistant" and .message.content != null)] | last | .message.content[0].text // empty'
}

# Get all assistant messages from transcript (JSONL format)
get_all_assistant_messages() {
    local transcript="$1"
    echo "$transcript" | jq -s -r '[.[] | select(.message.role == "assistant" and .message.content != null)] | .[].message.content[0].text // empty'
}

# Get last user message from transcript (JSONL format)
get_last_user_message() {
    local transcript="$1"
    echo "$transcript" | jq -s -r '[.[] | select(.message.role == "user" and .message.content != null)] | last | .message.content // empty'
}
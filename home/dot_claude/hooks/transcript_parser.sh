#!/bin/bash

# Functions for parsing Claude transcript data

# Get project root from transcript
get_project_root() {
    local transcript="$1"
    echo "$transcript" | jq -r '.[0].env.working_directory // empty'
}

# Get last assistant message from transcript
get_last_assistant_message() {
    local transcript="$1"
    echo "$transcript" | jq -r '[.[] | select(.role == "assistant" and .content != null)] | last | .content // empty'
}

# Get all assistant messages from transcript
get_all_assistant_messages() {
    local transcript="$1"
    echo "$transcript" | jq -r '[.[] | select(.role == "assistant" and .content != null)] | .[].content'
}

# Get last user message from transcript
get_last_user_message() {
    local transcript="$1"
    echo "$transcript" | jq -r '[.[] | select(.role == "user" and .content != null)] | last | .content // empty'
}
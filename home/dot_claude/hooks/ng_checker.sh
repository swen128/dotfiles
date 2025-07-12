#!/bin/bash

# NG (Not Good) keyword and command checker functions

# Get the directory where hooks are installed
HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_DIR="$HOOKS_DIR/rules"

# Check for NG keywords in a message
check_ng_keywords() {
    local message="$1"
    local rules_file="$RULES_DIR/ng_keywords.json"
    
    # Check if rules file exists
    if [ ! -f "$rules_file" ]; then
        return 0
    fi
    
    # Convert message to lowercase for case-insensitive matching
    local lower_message=$(echo "$message" | tr '[:upper:]' '[:lower:]')
    
    # Parse rules and check each one
    local rule_count=$(jq '.rules | length' "$rules_file")
    for ((i=0; i<$rule_count; i++)); do
        local keywords=$(jq -r ".rules[$i].keywords[]" "$rules_file" 2>/dev/null)
        local rule_message=$(jq -r ".rules[$i].message" "$rules_file")
        
        while IFS= read -r keyword; do
            if [ -n "$keyword" ] && [[ "$lower_message" == *"$(echo "$keyword" | tr '[:upper:]' '[:lower:]')"* ]]; then
                echo "Blocked: $rule_message" >&2
                return 2
            fi
        done <<< "$keywords"
    done
    
    return 0
}

# Check for NG commands
check_ng_commands() {
    local command="$1"
    local rules_file="$RULES_DIR/ng_commands.json"
    
    # Check if rules file exists
    if [ ! -f "$rules_file" ]; then
        return 0
    fi
    
    # Parse rules and check each one
    local rule_count=$(jq '.rules | length' "$rules_file")
    for ((i=0; i<$rule_count; i++)); do
        local commands=$(jq -r ".rules[$i].commands[]" "$rules_file" 2>/dev/null)
        local rule_message=$(jq -r ".rules[$i].message" "$rules_file")
        
        while IFS= read -r ng_command; do
            if [ -n "$ng_command" ] && [[ "$command" == *"$ng_command"* ]]; then
                echo "$rule_message" >&2
                return 2
            fi
        done <<< "$commands"
    done
    
    return 0
}
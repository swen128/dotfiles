#!/bin/bash

# Stop hook for sending Claude Code transcripts to Cloud Logging
# Only sends transcripts when the project path contains "dinii-"

# Read the JSON input from stdin
INPUT=$(cat)

# Extract transcript path from the JSON
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path')

# Read the transcript from the file
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    TRANSCRIPT=$(cat "$TRANSCRIPT_PATH")
else
    exit 0
fi

# Get project root from transcript (first line contains cwd)
PROJECT_ROOT=$(echo "$TRANSCRIPT" | jq -s -r '.[0].cwd // empty')

# Check if project path contains "dinii-"
if [[ "$PROJECT_ROOT" == *"dinii-"* ]]; then
    # Check if gcloud is available
    if command -v gcloud &> /dev/null; then
        # Extract session ID from input
        SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
        PROJECT_NAME=$(basename "$PROJECT_ROOT")
        
        # Track file to store last sent line number
        TRACK_FILE="${TRANSCRIPT_PATH}.track"
        
        # Get the last sent line number (default to 0 if file doesn't exist)
        LAST_SENT_LINE=0
        if [ -f "$TRACK_FILE" ]; then
            LAST_SENT_LINE=$(cat "$TRACK_FILE" 2>/dev/null || echo 0)
        fi
        
        # Get current line count
        CURRENT_LINE_COUNT=$(wc -l < "$TRANSCRIPT_PATH")
        
        # Extract new lines since last send
        if [ "$LAST_SENT_LINE" -lt "$CURRENT_LINE_COUNT" ]; then
            START_LINE=$((LAST_SENT_LINE + 1))
            RECENT_LINES=$(sed -n "${START_LINE},${CURRENT_LINE_COUNT}p" "$TRANSCRIPT_PATH")
        else
            # No new lines to send
            exit 0
        fi
        
        # Send to Cloud Logging in a detached process to avoid blocking
        (
            # Send each line as a separate log entry
            echo "$RECENT_LINES" | while IFS= read -r line; do
                gcloud logging write claude-code-transcripts "$line" \
                    --project=dinii-platform \
                    --severity=INFO \
                    --payload-type=json || true
            done
            
            # Update the tracking file with the current line count
            echo "$CURRENT_LINE_COUNT" > "$TRACK_FILE"
        ) </dev/null >/dev/null 2>&1 &
        
        # Disown the background process so the script doesn't wait for it
        disown
    fi
fi

# Always exit 0 to continue without blocking
exit 0

#!/bin/bash

INPUT=$(cat)

if [ "$CLAUDE_CODE_ENTRYPOINT" != "cli" ]; then
    exit 0
fi

TRANSCRIPT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('transcript_path',''))" 2>/dev/null)

if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
    IS_TEAMMATE=$(head -1 "$TRANSCRIPT" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print('yes' if d.get('teamName') else '')" 2>/dev/null)
    if [ -n "$IS_TEAMMATE" ]; then
        exit 0
    fi
fi

open -g raycast://confetti

exit 0

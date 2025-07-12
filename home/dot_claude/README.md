# Claude Code Configuration

This directory contains configuration files and scripts for Claude Code, including hooks, settings, and project-specific instructions.

## Directory Structure

```
~/.claude/
├── CLAUDE.md                   # General coding principles and best practices
├── README.md                   # This file
└── hooks/                      # Hook scripts and configurations
    ├── executable_pre-tool-use.sh  # Main pre-tool-use hook
    ├── executable_stop.sh          # Main stop hook
    ├── transcript_parser.sh        # Utility functions for parsing transcripts
    ├── ng_checker.sh              # NG (Not Good) keyword/command checker
    └── rules/
        ├── ng_keywords.json       # Blocked keywords configuration
        └── ng_commands.json       # Blocked commands configuration
```

## Components

### CLAUDE.md

Contains universal programming principles and best practices that Claude should follow across all projects. This includes:
- Coding conventions and standards
- Git/commit conventions
- Architecture principles
- Testing approaches
- Development workflow guidelines

### Hooks

Shell scripts that execute at specific Claude Code events:
- **pre-tool-use**: Before any tool is executed
- **stop**: When the main agent finishes processing

## Hook Configuration

### NG Keywords (`hooks/rules/ng_keywords.json`)

Defines keywords that should trigger warnings when used in assistant responses:

```json
{
  "rules": [
    {
      "keywords": ["efficient"],
      "message": "The word 'efficient' suggests optimization without being asked. Please focus on the specific task requested."
    },
    {
      "keywords": ["instead", "alternatively"],
      "message": "Avoid suggesting alternatives unless explicitly asked. Implement the requested solution."
    }
  ]
}
```

### NG Commands (`hooks/rules/ng_commands.json`)

Defines shell commands that should be blocked:

```json
{
  "rules": [
    {
      "commands": ["rm -rf /", "rm -rf ~"],
      "message": "Dangerous command blocked: This could delete critical system files."
    }
  ]
}
```

## Project-Specific Hooks

Projects can define their own hooks by creating a `.claude.local/hooks/` directory in the project root:

```bash
project-root/
└── .claude.local/
    └── hooks/
        ├── pre-tool-use.sh
        └── stop.sh
```

Project-specific hooks receive the same JSON input as global hooks and can:
- Block tool usage by exiting with code 2
- Add project-specific validations
- Implement custom logging or notifications

### Example Project Hook

```bash
#!/bin/bash
# .claude.local/hooks/pre-tool-use.sh

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Block WebSearch in this project
if [ "$TOOL_NAME" = "WebSearch" ]; then
    echo "WebSearch is disabled for this project" >&2
    exit 2
fi

exit 0
```

## Hook Input/Output

### Input Format

Hooks receive JSON input via stdin containing:
- `session_id`: Current session identifier
- `transcript_path`: Path to the JSONL transcript file
- `hook_event_name`: The event that triggered the hook
- `tool_name`: (pre-tool-use only) The tool being invoked
- `tool_input`: (pre-tool-use only) The tool's input parameters

### Exit Codes

- `0`: Success, continue normally
- `2`: Block the operation with an error message
- Other: Non-blocking error

### Error Messages

Error messages should be written to stderr and will be displayed to the user:

```bash
echo "Error: Operation blocked" >&2
exit 2
```

## Extending the Hooks

To add new validations:

1. **Add new keywords**: Edit `rules/ng_keywords.json`
2. **Add new blocked commands**: Edit `rules/ng_commands.json`
3. **Add custom logic**: Modify the hook scripts directly
4. **Create project-specific rules**: Add hooks to `.claude.local/hooks/`


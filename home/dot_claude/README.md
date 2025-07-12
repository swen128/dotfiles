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

## Utility Functions

### transcript_parser.sh

Provides functions for parsing JSONL transcript files:
- `get_project_root()`: Extract the working directory from transcript
- `get_last_assistant_message()`: Get the most recent assistant response
- `get_last_user_message()`: Get the most recent user message
- `get_all_assistant_messages()`: Get all assistant messages

### ng_checker.sh

Provides validation functions:
- `check_ng_keywords()`: Check if a message contains blocked keywords
- `check_ng_commands()`: Check if a command contains blocked patterns

## Extending the Hooks

To add new validations:

1. **Add new keywords**: Edit `rules/ng_keywords.json`
2. **Add new blocked commands**: Edit `rules/ng_commands.json`
3. **Add custom logic**: Modify the hook scripts directly
4. **Create project-specific rules**: Add hooks to `.claude.local/hooks/`

## Debugging

To debug hooks:
1. Add debug output to stderr: `echo "[DEBUG] Message" >&2`
2. Check Claude Code's output for hook stderr messages
3. Verify JSON parsing with `jq` commands
4. Test hooks manually by piping sample JSON input

## Best Practices

1. **Exit quickly**: Hooks have a timeout, so avoid long-running operations
2. **Validate JSON**: Always check if fields exist before using them
3. **Use stderr for messages**: stdout is reserved for JSON responses
4. **Be specific with errors**: Provide clear, actionable error messages
5. **Test thoroughly**: Hooks run with full user permissions
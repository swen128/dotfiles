# Claude Code Configuration

This directory contains configuration files and scripts for Claude Code.

## Directory Structure

```
~/.claude/
├── settings.json         # Claude Code settings
├── commands/            # Custom command scripts
├── projects/            # Project-specific configs
└── hooks/               # Hook scripts
    └── rules/
        └── ng_commands.json  # Blocked commands
```

## Key Features

- **Hooks**: Scripts that execute at Claude Code events (pre/post tool use, stop, etc.)
- **Command blocking**: Prevents dangerous or unwanted commands via `ng_commands.json`
- **Project-specific hooks**: Can be added via `.claude.local/hooks/`


## Usage

- Edit `hooks/rules/ng_commands.json` to add/remove blocked commands
- Create `.claude.local/hooks/` in any project for project-specific hooks
- Hooks exit with code 2 to block operations


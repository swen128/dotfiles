---
disable-model-invocation: true
---

Add or edit Claude Code settings (hooks, skills, or agents) according to the user request.

First, ask the user (if not already specified):
1. What type of setting: **hooks**, **skills**, or **agents**?
2. Whether it is **user-scope** or **project-scope**?

Then read the appropriate documentation:
- Hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Skills: https://docs.anthropic.com/en/docs/claude-code/skills
- Agents: https://docs.anthropic.com/en/docs/claude-code/sub-agents

Edit the configuration based on scope:

| Type   | User-scope path                                         | Project-scope path              |
|--------|--------------------------------------------------------|--------------------------------|
| Hooks  | `~/.local/share/chezmoi/home/dot_claude/exact_hooks/`  | `<project-root>/.claude/hooks/`  |
| Skills | `~/.local/share/chezmoi/home/dot_claude/skills/`       | `<project-root>/.claude/skills/` |
| Agents | `~/.local/share/chezmoi/home/dot_claude/agents/`       | `<project-root>/.claude/agents/` |

If user-scope, run `chezmoi apply --force` after editing.

## User Request
$ARGUMENTS

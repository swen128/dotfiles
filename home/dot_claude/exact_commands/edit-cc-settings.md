---
disable-model-invocation: true
---

Add or edit Claude Code settings (hooks, skills, agents, or plugins) according to the user request.

First, ask the user (if not already specified):
1. What type of setting: **hooks**, **skills**, or **agents**?
2. Whether it is **user-scope** or **project-scope**?

Then read the appropriate documentation:
- Hooks: https://code.claude.com/docs/en/hooks.md
- Skills: https://code.claude.com/docs/en/skills.md
- Agents: https://code.claude.com/docs/en/sub-agents.md
- Plugins: https://code.claude.com/docs/en/plugins-reference.md

Edit the configuration based on scope:

| Type   | User-scope path                                         | Project-scope path              |
|--------|--------------------------------------------------------|--------------------------------|
| Hooks  | `~/.local/share/chezmoi/home/dot_claude/exact_hooks/`  | `<project-root>/.claude/hooks/`  |
| Skills | `~/.local/share/chezmoi/home/dot_claude/skills/`       | `<project-root>/.claude/skills/` |
| Agents | `~/.local/share/chezmoi/home/dot_claude/agents/`       | `<project-root>/.claude/agents/` |

If user-scope, run `chezmoi apply --force` after editing.

## User Request
$ARGUMENTS

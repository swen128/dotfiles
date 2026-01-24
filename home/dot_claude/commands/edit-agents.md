---
disable-model-invocation: true
---

Add or edit a Claude Code agents configuration according to the user request.

First, ask the user (if not already specified) whether the agent is user-scope or project-scope.

Then Read https://docs.anthropic.com/en/docs/claude-code/sub-agents and modify the Claude Code agent settings based on the following request: 

If it is user-scope, edit the configuration at `~/.local/share/chezmoi/home/dot_claude/agents/`
and then run `chezmoi apply --force`.
Otherwise, edit `<project-root>/.claude/agents/`.

## User Request
$ARGUMENTS


---
disable-model-invocation: true
---

Add or edit a Claude Code skills configuration according to the user request.

First, ask the user (if not already specified) whether the skill is user-scope or project-scope.

Then Read https://docs.anthropic.com/en/docs/claude-code/skills and modify the Claude Code skill settings based on the following request: 

If it is user-scope, edit the configuration at `~/.local/share/chezmoi/home/dot_claude/skills/`
and then run `chezmoi apply --force`.
Otherwise, edit `<project-root>/.claude/skills/`.

## User Request
$ARGUMENTS


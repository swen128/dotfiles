---
disable-model-invocation: true
---

Add or edit an Claude Code hooks configuration according to the user request.

First, ask the user (if not already specified) whether the hook is user-scope or project-scope.

Then Read https://docs.anthropic.com/en/docs/claude-code/hooks and modify the project-level Claude Code hook settings based on the following request: 

If it is user-scope, edit the configuration at `~/.local/share/chezmoi/home/dot_claude/hooks/`
and then run `chezmoi apply --force`.
Otherwise, edit `<project-root>/.claude/hooks/`.

## User Request
$ARGUMENTS


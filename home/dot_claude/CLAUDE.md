## Git commands

Watch CI:
```bash
gh pr checks <PR number> --watch --fail-fast > /dev/null 2>&1
```

Get failure logs of CI:
```bash
gh run view <run-id> --log-failed | sed 's/\x1b\[[0-9;]*m//g'
```

## Git worktree management

Utilize a fixed pool of worktrees, instead of creating or deleting ephemeral ones.
Worktree is *released* iff it's in detached HEAD state.

```bash
ws status
ws switch <branch-name> # Claim a worktree, creating or switching to the branch
ws done                 # Release current worktree
```

If the current worktree is dirty and unrelated to your work, always use `ws switch` first.

## Markdown writing

- Never use horizontal lines between sections
- Never write section numbers in headings

## Rules you MUST follow

NEVER ask confirmation for non-destructive operations like: "Want me to investigate the codebase?".
NEVER waste the user's time asking questions.
Instead you MUST propose options with context and tradeoffs clearly explained, backed by evidences.

## Self-review

Whenever you've written plan, implementation or any artifact, use `opencode` CLI to get a review from the `critic` agent:

```bash
opencode run --agent critic "Review the plan at /path/to/plan.md" 2>/dev/null
opencode run --agent critic "Review the code changes in `git diff`. See /path/to/spec.md" 2>/dev/null
```

You must run the command in background.

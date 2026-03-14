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

When you make changes to the dinii-self-all repository, manage git worktrees using `ws` commands.

```
ws switch <name>  # Switch to or create a workspace
ws done           # Release current workspace
ws status         # Show current workspace status
```

You must first run `ws status`. If you are not in any workspace, or the current workspace is unrelated to your work, run `ws switch` with branch name following the conventional commit.

## Markdown writing

- Never use horizontal lines between sections
- Never write section numbers in headings

## Self-review

Whenever you've written plan, implementation or any artifact, use `opencode` CLI to get a review from the `critic` agent:

```bash
opencode run --agent critic "Review the plan at /path/to/plan.md" 2>/dev/null
opencode run --agent critic "Review the code changes in `git diff`. See /path/to/spec.md" 2>/dev/null
```

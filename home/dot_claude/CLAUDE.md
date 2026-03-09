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
ws new <name>  # Create a workspace. Claim an idle worktree, create (from origin/main) or check out branch <name>
ws done        # Release current workspace
ws go <name>   # cd to workspace by name
ws status      # Show current workspace status
```

You must first run `ws status`. If you are not in any workspace, or the current workspace is unrelated to your work, run `ws new` with branch name folloiwng the covnentional commit.

## Markdown writing

- Never use horizontal lines between sections
- Never write section numbers in headings

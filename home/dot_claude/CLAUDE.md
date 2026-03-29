## Git worktree management

Utilize a fixed pool of worktrees, instead of creating or deleting ephemeral ones.
Worktree is *released* iff it's in detached HEAD state.

```bash
ws status
ws switch <branch-name> # Claim a worktree, creating or switching to the branch
ws done                 # Release current worktree
```

If the current worktree is dirty and unrelated to your work, always use `ws switch` first.

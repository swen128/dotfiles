## Git worktree management

Utilize a fixed pool of worktrees. Never create or delete ephemeral one.
Worktree is considered *released* iff it's in detached HEAD state.

Claim a worktree if the current tree is dirty and unrelated to your task.
Release the worktree when a PR is marked ready for review, or the task is dropped.

## Git worktree management

Utilize a fixed pool of worktrees, instead of creating or deleting ephemeral one for each short-lived task.
Worktree is considered *released* iff it's in detached HEAD state.

Claim a worktree if the current tree is dirty and unrelated to your task.
Release the worktree when a PR is marked ready for review, or the task is dropped.

## Markdown writing

- Never use horizontal lines between sections
- Never write section numbers in headings

# Workspace (`ws`) Command Specification

## Introduction

The `ws` command provides a workspace abstraction on top of git worktrees, treating them as a **pool** of reusable worktrees. A workspace is any pool worktree that has a branch checked out (not in detached HEAD state). The workspace name is the branch name.

Idle worktrees are those in detached HEAD state, available to be claimed for new work.

## Requirements

### 1. Switch to a workspace (`ws switch <name>`)

**User Story:** As a developer, I want a single command to get into a workspace by name — creating it if necessary — so that I don't have to think about whether it already exists.

**Acceptance Criteria:**

1. When a pool worktree already has branch `<name>` checked out, the system SHALL `cd` into that worktree root.
2. When no pool worktree has branch `<name>` checked out, the system SHALL select an idle worktree, check out or create branch `<name>`, and `cd` into the worktree root.
3. Branch resolution order for checkout: (a) existing local branch `<name>`, (b) existing remote branch `origin/<name>` (create tracking branch), (c) new branch from `origin/<default-branch>`.
4. When creating a new branch (case c), the system SHALL run `git fetch origin <default-branch>` before creating. The default branch is discovered via `git remote show origin` with fallback to `main`.
5. When no idle worktrees are available and the workspace does not already exist, the system SHALL display an error message and fail.
6. When run without a name argument, the system SHALL `cd` to the main worktree.
7. `w [<name>]` SHALL be an alias for `ws switch [<name>]`.

### 2. Finish a workspace (`ws done`)

**User Story:** As a developer, I want to release a workspace when I'm done with it, so that the worktree returns to the pool for future use.

**Acceptance Criteria:**

1. When run from within a pool worktree that has a branch checked out, the system SHALL detach HEAD (`git checkout --detach`) and `cd` to the main repository root.
2. When the worktree is in detached HEAD state, the system SHALL display an error ("already idle").
3. When there are uncommitted changes (dirty working tree or staged changes), the system SHALL refuse to proceed and display an error message.
4. When run with `--force` and there are uncommitted changes, the system SHALL run `git add -A && git commit --no-verify -m "wip: auto-commit from ws done --force"`, then detach HEAD. If the commit fails, abort without detaching.
5. When there are unpushed commits on the branch, the system SHALL print a warning and prompt for confirmation (Enter to continue, Ctrl+C to cancel). Under `--force`, skip the prompt and just print the warning.
6. When run from outside any pool worktree (main repo, non-pool worktree, or not in a git repo), the system SHALL display an error message.
7. When releasing a workspace, the system SHALL attempt `git branch -d` (safe delete). If the branch is fully merged, it is deleted. If not, it is kept.

### 3. Show workspace status (`ws status`)

**User Story:** As a developer, I want to see the current workspace and all active workspaces at a glance.

**Acceptance Criteria:**

1. The system SHALL display the current workspace name (branch name) if the user is inside a pool worktree with a branch checked out, or "(not inside any workspace)" otherwise.
2. The system SHALL list all active workspaces (pool worktrees with a branch checked out), marking the current one with `*`.
3. The system SHALL display the number of idle worktrees available.
4. When there are no active workspaces, the system SHALL indicate that.
5. The command SHALL work from any directory within the same git repository (main repo, pool worktree, or subdirectory).

### 4. Create a worktree (`ws create-worktree [path]`)

**User Story:** As a developer, I want to add a new worktree to the pool so that I have more slots available for concurrent work.

**Acceptance Criteria:**

1. The system SHALL create a new git worktree in detached HEAD state at the given `<path>`.
2. When no `<path>` is provided, the system SHALL auto-generate a path under `$HOME/worktrees/<owner>/<repo>/wt-N`, where `<owner>` and `<repo>` are parsed from the GitHub remote URL (`remote.origin.url`), and N is the smallest positive integer that does not collide with an existing directory at that location.
3. The system SHALL fail with an error if the target path already exists.
4. The system SHALL fail with an error if not inside a git repository.

### 5. Command surface

The full command set is:

| Command | Description |
|---|---|
| `ws switch [<name>]` | Switch to a workspace, or to the main worktree if no name given |
| `ws done [--force]` | Release current workspace |
| `ws status` | Show workspace status |
| `ws create-worktree [path]` | Add a new idle worktree |
| `w [<name>]` | Alias for `ws switch [<name>]` |

The previous `ws new`, `ws go` subcommands and the `gw` function are removed.

### 6. Pool membership and discovery

**Acceptance Criteria:**

1. A **pool worktree** is any worktree of the current repository (as reported by `git worktree list`) excluding the main worktree.
2. A pool worktree is **idle** when it is in detached HEAD state.
3. A pool worktree is an **active workspace** when it has a branch checked out. The workspace name equals the branch name.

### 7. Shell completion

**Acceptance Criteria:**

1. `ws <TAB>` SHALL offer: `switch`, `done`, `status`, `create-worktree`.
2. `ws switch <TAB>` SHALL offer active workspace names (branches checked out in pool worktrees).
3. `w <TAB>` SHALL offer the same completions as `ws switch <TAB>`.


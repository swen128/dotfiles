# Workspace (`ws`) Command Specification

## Introduction

The `ws` command provides a workspace abstraction on top of git worktrees, treating them as a **pool** of reusable worktrees. Instead of managing worktrees directly, developers claim a worktree from the pool when starting work (giving it a workspace name) and release it when done. This solves the pain point that idle worktrees must each have a unique branch checked out — released worktrees are parked in detached HEAD state, allowing any number of them to coexist without branch conflicts.

The workspace name is a logical name (e.g., "fix-auth", "refactor-api") that maps to a physical worktree in the pool. The pool is scoped per repository (identified by GitHub remote `owner/repo`).

## Requirements

### 1. Create a new workspace (`ws new <name>`)

**User Story:** As a developer, I want to claim an idle worktree from the pool and assign it a workspace name, so that I can start working on a new task without waiting for worktree creation.

**Acceptance Criteria:**

1. When the user runs `ws new <name>`, the system SHALL select an idle worktree from the pool (one in detached HEAD state), check out a new branch named `<name>` based on `origin/<default-branch>`, and `cd` into the worktree root.
2. When an idle worktree is claimed, the system SHALL run `git fetch origin <default-branch>` before creating the branch, so the workspace starts from the latest upstream code.
3. When no idle worktrees are available in the pool, the system SHALL display an error message and fail.
4. When a workspace with the given `<name>` already exists, the system SHALL display an error message and not create a duplicate.
5. When the user runs `ws new` without a name argument, the system SHALL display a usage error.
6. The mapping between workspace name and worktree path SHALL be stored in a state file at `$WT_ROOT/$owner/$repo/.workspaces` (simple `name=path` format).

### 2. Finish a workspace (`ws done`)

**User Story:** As a developer, I want to release a workspace when I'm done with it, so that the worktree returns to the pool for future use.

**Acceptance Criteria:**

1. When the user runs `ws done` from within a claimed worktree, the system SHALL detach HEAD (`git checkout --detach`), remove the workspace mapping from the state file, and `cd` to the main repository root.
2. When there are uncommitted changes (dirty working tree or staged changes) in the worktree, the system SHALL refuse to proceed and display an error message.
3. When the user runs `ws done --force` and there are uncommitted changes, the system SHALL commit all changes (staged and unstaged) with an automatic commit message, then detach HEAD and release the workspace.
4. When there are unpushed commits on the branch, the system SHALL warn the user before proceeding.
4. When the user runs `ws done` from outside any pool worktree, the system SHALL display an error message.
5. When releasing a workspace, the system SHALL NOT delete the branch — the user may still need it (e.g., for a PR).

### 3. Go to a workspace (`ws go <name>`)

**User Story:** As a developer, I want to quickly navigate to a workspace by its logical name, so that I can switch between tasks without remembering worktree paths.

**Acceptance Criteria:**

1. When the user runs `ws go <name>`, the system SHALL `cd` to the worktree root directory of the workspace with the given name.
2. When the given workspace name does not exist, the system SHALL display an error message listing available workspaces.
3. When the user runs `ws go` without a name argument, the system SHALL display a usage error.

### 4. Show workspace status (`ws status`)

**User Story:** As a developer, I want to see the current workspace and all active workspaces at a glance, so that I can know where I am and what's in progress.

**Acceptance Criteria:**

1. When the user runs `ws status`, the system SHALL display the current workspace name at the top if the user is inside a claimed worktree.
2. When the user runs `ws status`, the system SHALL display all active workspaces with their names and branches, marking the current one with `*`.
3. When the user runs `ws status`, the system SHALL display the number of idle worktrees available in the pool.
4. When there are no active workspaces, the system SHALL indicate that no workspaces are active.

### 5. Pool structure and state management

**User Story:** As a developer, I want the workspace pool to be managed automatically, so that I don't have to manually create or track worktrees.

**Acceptance Criteria:**

1. The workspace state file SHALL be located at `$WT_ROOT/$owner/$repo/.workspaces`.
2. The state file SHALL use a simple line-based format: `<workspace-name>\t<worktree-directory-name>`.
3. A worktree SHALL be considered "idle" when it is in detached HEAD state AND not listed in the workspaces state file. Any worktree directory under `$WT_ROOT/$owner/$repo/` — regardless of its name — is eligible to be part of the pool.
4. When `ws new` needs to create a new worktree (no idle ones available), the directory name is an implementation detail and SHALL NOT be relied upon by other parts of the system.
5. The system SHALL be scoped to the current repository, determined by parsing the GitHub remote URL from `git config --get remote.origin.url`.

### 6. Shell completion

**User Story:** As a developer, I want tab completion for `ws` subcommands and workspace names, so that I can work efficiently.

**Acceptance Criteria:**

1. When the user types `ws <TAB>`, the system SHALL offer completions for subcommands: `new`, `done`, `go`, `status`.
2. When the user types `ws go <TAB>`, the system SHALL offer completions for active workspace names (from the state file).

### 7. Coexistence with `gw`

**User Story:** As a developer, I want `ws` and `gw` to coexist without conflicts, so that I can use both workflows as needed.

**Acceptance Criteria:**

1. Pool worktrees SHALL coexist in the same `$WT_ROOT/$owner/$repo/` directory alongside named worktrees created by `gw`.
2. The `gw` command SHALL NOT be modified by this change.
3. The `z` and `zi` zoxide wrappers SHALL continue to work with pool worktrees (they already handle the `$WT_ROOT/$owner/$repo/<worktree>` pattern).


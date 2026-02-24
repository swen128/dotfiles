---
name: handoff-tasks
description: Reads nb todos, identifies non-blocked coding tasks, and spawns parallel agents across existing git worktrees to work on them independently. Creates draft PRs and marks tasks as waiting-human-approval.
disable-model-invocation: true
---

# Handoff Tasks

Delegate non-blocked coding tasks to parallel agents, each working in its own existing git worktree.

## Step 1: Gather todo state

Run the dependency graph script to understand the current todo landscape:

```bash
bun run ~/.claude/skills/check-todo/scripts/dep-graph.ts
```

From the output, identify all **non-blocked** tasks (those marked "READY" or independent with status `not_started` or `pending`). Filter to only **coding tasks** that an agent can complete autonomously — skip:
- Ops-only work (deployments, infra changes, manual migrations)
- Announcements or communication tasks
- Manual verification or QA tasks
- Tasks requiring human decision-making (architectural design, schema design, API contract decisions, etc.)

## Step 2: List existing git worktrees

Run `git worktree list` to discover available worktrees. **Do NOT create new worktrees.** The main worktree is excluded — only use secondary worktrees.

If there are no secondary worktrees, stop and tell the user they need to create worktrees first.

## Step 3: Assign and spawn agents

Match each eligible task to an available worktree (1 task per worktree). The number of agents N = min(eligible tasks, available secondary worktrees).

For each assignment, spawn a **background worker agent** (`run_in_background: true`, `subagent_type: "worker"`) with a prompt that includes:

1. **The worktree path** — the agent must `cd` into this worktree and work entirely within it.
2. **The full todo content** — read the todo with `nb show <id> --no-color` and include the content in the prompt.
3. **Clear instructions**:
   - Read and understand the task requirements from the todo.
   - Create a feature branch from the latest main: `git checkout -b <descriptive-branch-name>`.
   - Implement the coding task. Focus only on code changes.
   - Commit changes with conventional commit messages.
   - Push the branch and create a **draft PR** using `gh pr create --draft`.
   - The PR description should reference the todo and summarize what was done.
4. **Mandatory proof of work** — the agent MUST include the following in its final output:
   - The exact commands it ran to build/lint/test and their full output (exit codes, stdout, stderr).
   - For each acceptance criterion in the todo, a concrete description of how it was verified and what evidence proves it passes.
   - The draft PR URL.
   - A list of all files changed with a one-line summary per file.

## Step 4: Verify each agent's work

Wait for all agents to complete, then **independently verify every claim**. Do NOT trust the agents' self-reported results.

For each completed task:

1. **Read the agent's output** via `TaskOutput` and extract the claimed proof of work.
2. **Go into the worktree yourself** and independently run:
   - `git diff main..HEAD --stat` to confirm the scope of changes matches what was claimed.
   - The project's build command — confirm it exits 0.
   - The project's test/lint commands — confirm they pass.
   - Read the changed files directly to check code quality and correctness.
3. **Check acceptance criteria** from the original todo against the actual code. For each criterion, form your own judgement — do not rely on the agent's assertion.
4. **Verdict per task**:
   - **PASS**: All criteria met, build/tests pass, code is correct. Update the todo status to `waiting_human_approval`.
   - **FAIL**: Log what failed and why. Do NOT update the todo status. Report the failure to the user with specifics so they can decide next steps.

Update passing todos:

```bash
nb edit <id> --content "<full content with status: waiting_human_approval>" --overwrite
```

## Step 5: Report

Tell the user:
- Which tasks were assigned to which worktrees
- Per task: PASS/FAIL verdict with evidence summary
  - For PASS: the draft PR URL and what was verified
  - For FAIL: what specifically failed verification and why
- Any tasks that were skipped and why (not coding, no worktree available, blocked, etc.)

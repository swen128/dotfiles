---
name: ultra-dev
description: Structured dev workflow with plan, interface-first TDD, draft PR, and remote auto-fix.
user-invocable: true
disable-model-invocation: true
argument-hint: <task description>
---

Structured development workflow. Takes a task from plan to PR with user approval gates.

You MUST use TaskCreate to register all steps up front before starting any work.

## Workflow

When invoked, immediately create tasks for the full pipeline using the TaskCreate tool.
Then execute them in order:

### Create implementation plan

- Explore the codebase thoroughly to understand existing patterns and architecture
- Use Plan agents to design the implementation
- Write a detailed plan covering: files to change, interfaces to add, test strategy
- Get a critic review via `opencode run --agent critic` (run in background)
- Present the plan to the user

### Get user approval on plan

- Ask the user to approve, adjust, or reject the plan
- Iterate until approved

### Implement interfaces and tests

- Write only the public interfaces (types, function signatures, class stubs)
- Write tests against those interfaces (tests should fail since implementation is stubbed)
- Run the tests to confirm they fail for the right reasons
- Present the interfaces and test results to the user

### Get user approval on interfaces and tests

- Ask the user to approve the interfaces and test design
- Iterate until approved

### Implement the rest

- Fill in the implementation behind the interfaces
- Run tests and fix until all pass
- Run the full test suite to check for regressions
- Verify the build succeeds

### Create a draft PR

- Follow PR template if any

### Use remote skill to auto-fix PR

- Use the `/remote` skill to spawn a remote session and subscribe it to the PR for auto-fix
- The remote session will handle CI failures and review comments automatically
- Report the session ID and PR URL to the user

## Rules

- Mark each task as `in_progress` when starting and `completed` when done
- Never skip an approval gate — always wait for user confirmation

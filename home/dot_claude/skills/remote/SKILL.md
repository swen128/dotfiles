---
name: remote
description: Spawn and manage remote Claude Code sessions in isolated cloud environments.
user-invocable: true
disable-model-invocation: false
---

Use the CLI to manage sessions of Claude Code on web.
If the user's intention is unclear from the context, ask what to do referring to the typical use cases.

## Commands

### spawn — create a remote session

```bash
bun ${CLAUDE_SKILL_DIR}/cli.ts spawn "Fix the auth bug in login.ts"
bun ${CLAUDE_SKILL_DIR}/cli.ts spawn --model sonnet "Write unit tests"
echo "detailed prompt here" | bun ${CLAUDE_SKILL_DIR}/cli.ts spawn
```

Options: `--model` (opus|sonnet|haiku), `--env` (environment ID)

Prints the session ID and web URL.

### list — show active sessions

```bash
bun ${CLAUDE_SKILL_DIR}/cli.ts list
```

### result — get last response

```bash
bun ${CLAUDE_SKILL_DIR}/cli.ts result <session-id>
bun ${CLAUDE_SKILL_DIR}/cli.ts result <session-id> --messages 6
```

Without `--messages`: prints the last result with cost and stop reason.
With `--messages N`: prints the last N conversation turns.

### watch — poll until complete

```bash
bun ${CLAUDE_SKILL_DIR}/cli.ts watch <session-id>
```

Blocks until `worker_status` becomes `idle`, then prints the result. Use with `run_in_background`.

### send — send a follow-up message

```bash
bun ${CLAUDE_SKILL_DIR}/cli.ts send <session-id> "Now add error handling"
cat feedback.md | bun ${CLAUDE_SKILL_DIR}/cli.ts send <session-id>
```

### auto-fix — subscribe to PR events

```bash
bun ${CLAUDE_SKILL_DIR}/cli.ts auto-fix <session-id> owner/repo 123
```

The session will auto-wake on CI failures and review comments to fix them.

### no-auto-fix — unsubscribe from PR events

```bash
bun ${CLAUDE_SKILL_DIR}/cli.ts no-auto-fix <session-id>
```

Repo and PR number are auto-detected from the session.

## Session IDs

Both `cse_` and `session_` prefixes are accepted. The CLI converts as needed.

## Use cases

### Running multiple tasks in parallel, in isolation

Spawn several remote sessions to implement independent changes simultaneously. Each session runs in its own cloud environment with a fresh clone, so they will not interfere with each other.

```bash
bun ${CLAUDE_SKILL_DIR}/cli.ts spawn "Implement feature A"
bun ${CLAUDE_SKILL_DIR}/cli.ts spawn "Implement feature B"
bun ${CLAUDE_SKILL_DIR}/cli.ts spawn "Refactor the auth module"
```

Each session creates its own branch and PR. Watch all of them or check results later.

### Plan locally, then implement remotely

Design the plan in your local session, then hand off implementation to a remote session.

```bash
cat .claude-works/my-task/plan.md | bun ${CLAUDE_SKILL_DIR}/cli.ts spawn
```

### Hand off PR

Delegate a PR to a remote session for auto-fixing CI failures and review comments. If the current branch doesn't have a PR yet, create a draft PR first, then subscribe the session.

```bash
# 1. Create a draft PR if one doesn't exist
gh pr create --draft --title "Fix auth flow" --body "..."

# 2. Spawn a remote session for the repo
bun ${CLAUDE_SKILL_DIR}/cli.ts spawn "You are watching PR #123 on owner/repo (branch: feature-branch). First, read the PR diff to understand what it changes. Then wait for GitHub webhook events to arrive — do not take action until an event requires it. When you fix an issue raised in a review comment, reply to that comment explaining what you changed."

# 3. Subscribe the session to the PR
bun ${CLAUDE_SKILL_DIR}/cli.ts auto-fix <session-id> owner/repo 123
```

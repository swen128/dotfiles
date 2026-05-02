---
name: slack
description: 'Use this skill whenever the user wants to do anything with Slack. Triggers on any Slack URL pasted, or phrases like "post to #<channel>", "send to slack", "Slack MCP", "reply in the thread", "find the slack message about ...", "watch for mentions".'
---

## Setup (run once per machine)

```bash
cd "${CLAUDE_SKILL_DIR}" && bun install
```

## How to invoke

```bash
bun "${CLAUDE_SKILL_DIR}/src/index.ts" <subcommand>
```

## Authentication

```bash
bun "${CLAUDE_SKILL_DIR}/src/index.ts" login --set-default
```

The command blocks until the user completes OAuth in their browser (or it times out at 5 minutes).

Do NOT run `login` proactively. Just run the command the user wanted (`post`, `search`, `read`, `watch`, etc.). Only run `login` if a command fails with `no_workspaces_authenticated`, `token_revoked`, `invalid_auth`, or `token_expired`:

## Posting

```bash
# plain text
bun "${CLAUDE_SKILL_DIR}/src/index.ts" post --channel '#general' --text 'hello'

# Block Kit from stdin
echo '[{"type":"section","text":{"type":"mrkdwn","text":"*hi*"}}]' \
  | bun "${CLAUDE_SKILL_DIR}/src/index.ts" post --channel '#general' --blocks -

# Block Kit from file
bun "${CLAUDE_SKILL_DIR}/src/index.ts" post --channel '#general' --blocks-file blocks.json

# thread reply (and broadcast back to channel)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" post --channel C0123 --thread-ts 1714600000.000000 --text 'reply' [--broadcast]

# edit / delete (only your own messages)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" post --channel C0123 --update 1714600000.000000 --text 'edited'
bun "${CLAUDE_SKILL_DIR}/src/index.ts" post --channel C0123 --delete 1714600000.000000

# attach metadata
bun "${CLAUDE_SKILL_DIR}/src/index.ts" post --channel '#general' --text 'event' \
  --metadata '{"event_type":"deploy","event_payload":{"sha":"abc"}}'

# schedule for the future (unix seconds, ISO 8601, or +1h/+30m/+2d)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" post --channel '#general' --text 'morning standup' --schedule '2026-05-03T09:00:00+09:00'
bun "${CLAUDE_SKILL_DIR}/src/index.ts" post --channel '#general' --text 'reminder' --schedule '+1h'
# returns { ok, scheduled: { channel, scheduled_message_id, post_at, post_at_iso } }
```

Channel selectors: `Cxxx`/`Gxxx`/`Dxxx` IDs, `#name`, bare `name`, or `@username` for a DM.

Block Kit limits enforced locally before the API call: ≤ 50 blocks, ≤ 40,000 chars overall, ≤ 4,000 chars on `chat.update.text`. The CLI does not validate block-type semantics — any block your manifest's permissions allow (including `table`, `task_card`, `rich_text`, etc.) is passed through verbatim.

Output: `{ ok, channel, ts, permalink }`.

## Reading by URL

```bash
# fetch one message by permalink (URL has no thread_ts)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" read 'https://example.slack.com/archives/C0123/p1714600000123456'

# fetch a whole thread (URL has thread_ts; passing any reply's URL also works)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" read 'https://example.slack.com/archives/C0123/p1714600005123456?thread_ts=1714600000.123456&cid=C0123'
```

Permalinks are emitted on every other CLI output (`post`, `search`, `read`, `watch`), so callers always have one to feed back in.

Output shape (uniform):
```json
{
  "ok": true,
  "channel": {"id": "C0123", "name": "general"},
  "thread_ts": "1714600000.123456" | null,
  "messages": [{"ts": "...", "user": {"id","name"}, "text": "...", "blocks": [...], "files": [...], "reply_count": N, ...}]
}
```

When `thread_ts` is null, `messages` has one entry. When set, parent first then replies in `ts` order. `blocks`, `attachments`, `files`, `subtype`, `reply_count` are surfaced when Slack returns them. Each `files[]` entry includes `id`, `name`, `mimetype`, `size`, `url_private`, `url_private_download`, `permalink`, plus `thumb_*` URLs.

## Downloading attached files

```bash
# by file id
bun "${CLAUDE_SKILL_DIR}/src/index.ts" files download --file-id F0ABC123 --out ./image.png

# by url_private (when you already have it from a `read` output)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" files download --url 'https://files.slack.com/files-pri/.../file.png' --out ./image.png
```

The user token must have **`files:read`** scope. If the token was issued before `files:read` was in the manifest, the CLI surfaces `missing_scope` (exit 10). To fix: regenerate the manifest (`bun "${CLAUDE_SKILL_DIR}/src/index.ts" app manifest`), update the app at <https://api.slack.com/apps> → "App Manifest", reinstall, and run `bun "${CLAUDE_SKILL_DIR}/src/index.ts" login` again. The CLI also detects when Slack serves an HTML login page in lieu of file bytes (a sign the token's scopes are stale) and aborts before writing garbage to disk.

Output:
```json
{ "ok": true, "file_id": "F...", "name": "...", "mimetype": "...", "size": N, "bytes_written": N, "path": "./..." }
```

## Searching

```bash
bun "${CLAUDE_SKILL_DIR}/src/index.ts" search 'in:#engineering deploy after:2026-01-01'
bun "${CLAUDE_SKILL_DIR}/src/index.ts" search 'spec.md' --files
bun "${CLAUDE_SKILL_DIR}/src/index.ts" search 'foo' --count 50 --cursor '*'
bun "${CLAUDE_SKILL_DIR}/src/index.ts" search 'foo' --sort timestamp --sort-dir asc
```

Slack search modifiers (`in:`, `from:`, `before:`, `after:`, `has:`, `is:`) pass through unchanged. Mentions of a user are expressed as `<@U…>` literal tokens.

Output: `{ ok, total, next_cursor, messages: [...] }` (or `files`). Each result includes channel id+name, user id+name, ts, permalink, text — names are resolved via cached `conversations.list`/`users.list`.

Note: Slack's `search.messages` doesn't always return `next_cursor` even when `total > count`; pagination beyond page 1 is not always reliable. For exhaustive scans prefer `conversations.history` against a known channel.

## Watching events

`watch` polls every 30s and streams NDJSON to stdout, one event per line, deduplicated by `ts`, starting from "now."

```bash
# stream forever (until SIGINT/SIGTERM)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" watch mentions
bun "${CLAUDE_SKILL_DIR}/src/index.ts" watch channel '#alerts'
bun "${CLAUDE_SKILL_DIR}/src/index.ts" watch thread C0123 1714600000.000000

# one poll cycle then exit (cron-friendly)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" watch mentions --once

# auto-exit after a duration
bun "${CLAUDE_SKILL_DIR}/src/index.ts" watch channel C0123 --timeout 1h
```

Subcommand details:
- `watch mentions` — polls `search.messages` with `<@<auth_user_id>>`. Subject to Slack's search-index lag (typically ~10s–2min); not real-time.
- `watch thread <channel> <thread-ts>` — polls `conversations.replies` with `oldest=<last_seen>`. No index lag.
- `watch channel <channel>` — polls `conversations.history`. No index lag.

Each NDJSON line: `{ kind, channel: {id, name}, user: {id, name}, ts, thread_ts, permalink, text, team_id }`. Permalink is included on every event (constructed locally for `watch channel`/`thread`, returned by Slack for `watch mentions`). DM channel names resolve to `@<username>`.

## Finding users and channels

```bash
# users by name / real_name / display_name / email (substring, case-insensitive)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" users find ogino
bun "${CLAUDE_SKILL_DIR}/src/index.ts" users find yuto.ogino@example.com

# channels by name (substring)
bun "${CLAUDE_SKILL_DIR}/src/index.ts" channels find general
bun "${CLAUDE_SKILL_DIR}/src/index.ts" channels find dev --include-archived

# full profile (status, timezone, title, custom fields, images) — accepts Uxxx, @handle, or email
bun "${CLAUDE_SKILL_DIR}/src/index.ts" users profile @yuto.ogino
bun "${CLAUDE_SKILL_DIR}/src/index.ts" users profile U07LXF25WHF
```

`users find` / `channels find` use the local 24h cache (refreshed on miss); `users profile` always hits `users.profile.get`. Output:
```json
{ "ok": true, "total": N, "users":    [{"id": "U…", "name": "…", "real_name": "…", "display_name": "…", "email": "…", "is_bot": false, "deleted": false}] }
{ "ok": true, "total": N, "channels": [{"id": "C…", "name": "…", "is_archived": false}] }
{ "ok": true, "user_id": "U…", "profile": { /* full Slack profile object */ } }
```

## Workspaces & multi-workspace

```bash
bun "${CLAUDE_SKILL_DIR}/src/index.ts" workspaces list                          # JSON list of authed workspaces
bun "${CLAUDE_SKILL_DIR}/src/index.ts" workspaces set-default <id|domain|name>
bun "${CLAUDE_SKILL_DIR}/src/index.ts" logout                                   # default workspace
bun "${CLAUDE_SKILL_DIR}/src/index.ts" logout --workspace acme
bun "${CLAUDE_SKILL_DIR}/src/index.ts" logout --all
```

Every non-auth subcommand accepts `--workspace <id|domain|name>` to target a specific workspace. The `SLACK_CLI_WORKSPACE` env var is also honoured.

## Output, errors, exit codes

- Default: pretty JSON on stdout. `--output ndjson` for line-delimited, `--output text` for ad-hoc terminal use. `watch` is always NDJSON.
- Errors: JSON on stderr — `{ error, message, request_id?, needed_scope?, retry_after? }`. Exit codes: `0` ok, `10` auth, `20` validation, `30` not-found, `40` rate-limit, `50` network, `60` slack-internal, `1` other.
- Diagnostic logs: `-v`/`--verbose` to stderr; secrets are masked.

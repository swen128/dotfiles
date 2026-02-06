---
name: todo
description: Manages TODO in `nb` CLI. You must use this skill when the user says something like "add TODO to nb".
disable-model-invocation: true
---

# Create nb TODO

Create a TODO item using the `nb` CLI.

## TODO Template

```markdown
---
status: not_started
blocked_by:
  - "[[other-todo.todo.md]]" # Optional: link to blocking todo
---

# [ ] Todo Title

#tag1 #tag2

## Overview

Brief description of what needs to be done.

## Why

Explain the motivation and context.

## What

Detailed description of the work.

## Tasks

- [ ] Subtask 1
- [ ] Subtask 2
- [ ] Subtask 3

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Dependencies

- **Blocked by**: List blocking items
- **Blocking**: List items this blocks

## Related

- Links to PRs, docs, etc.
```

## Frontmatter Options

| Field        | Values                                          | Description             |
| ------------ | ----------------------------------------------- | ----------------------- |
| `status`     | `not_started`, `pending`, `in_progress`, `done` | Current status          |
| `blocked_by` | `["[[filename.todo.md]]"]`                      | Links to blocking todos |

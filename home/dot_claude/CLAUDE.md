## Git commands

Watch CI:
```bash
gh pr checks <PR number> --watch --fail-fast > /dev/null 2>&1
```

Get failure logs of CI:
```bash
gh run view <run-id> --log-failed | sed 's/\x1b\[[0-9;]*m//g'
```

## Git worktree management

When you make changes to the dinii-self-all repository, manage git worktrees using `ws` commands.

```
ws new <name>  # Create a workspace. Claim an idle worktree, create (from origin/main) or check out branch <name>
ws done        # Release current workspace
ws go <name>   # cd to workspace by name
ws status      # Show current workspace status
```

You must first run `ws status`. If you are not in any workspace, or the current workspace is unrelated to your work, run `ws new` with branch name folloiwng the covnentional commit.

## Notes management

When the user refers to "note" or "nb", use the `nb` CLI. Notes are stored in `~/.nb/<notebook-name>/` as markdown files with git tracking.

### Reading

```bash
nb list                              # List all notes
nb list --tags <tag>                 # Filter by tag
nb show <id> --no-color              # Display content (use --no-color to avoid ANSI codes)
nb search "query"                    # Search content
nb search "#tag" --list              # Find notes with tag
nb todos                             # List all todos
nb todos --tags <tag>                # Filter todos by tag
```

### Creating

**CRITICAL**: `-t` adds `# Title` as H1 header automatically. Do NOT include H1 in content or it duplicates.

```bash
nb add -t "Title" -c "Body content without H1"           # -t adds H1, don't repeat
nb add -f "filename.md" -c "# Title\n\nContent"          # No -t, include H1 yourself
nb add -t "Title" -c "Content" --tags tag1,tag2          # With tags
nb todo add "Title"                                      # Create todo (.todo.md)
nb todo add "Title" --description "Desc" --tags tag1     # Todo with metadata
nb todo add "Title" --task "Subtask 1" --task "Subtask 2"  # Todo with subtasks
nb import /path/to/file.md                               # Import existing file (copy)
nb import move /path/to/file.md                          # Import by moving
```

### Editing

**CRITICAL**: `--content` APPENDS by default!

```bash
nb edit <id> --content "text" --overwrite    # Replace entire content
nb edit <id> --content "text"                # Append (rarely wanted)
nb edit <id> --content "text" --prepend      # Prepend
```

For complex edits, directly modify files in `~/.nb/home/` then run `nb index reconcile`.

### Task Management

```bash
nb do <id> <task-number>      # Mark task done
nb undo <id> <task-number>    # Mark task undone
nb todo delete <id> --force   # Delete todo
```

### Todo File Format

Todos use `.todo.md` extension with checkbox in title:

```markdown
# [ ] Todo Title

#tag1 #tag2

Content here...
```

Use `# [x] Title` for completed todos.

## Markdown writing

- Never use horizontal lines between sections
- Never write section numbers in headings
- Always use wiki style link for links between nb notes: [[relative_file_path]] or [[relative_file_path|text]]

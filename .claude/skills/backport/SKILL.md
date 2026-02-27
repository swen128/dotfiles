---
name: backport
description: Check diff between deployed dotfiles (target) and chezmoi source, and backport changes from the live system back into the chezmoi repository. Use when dotfiles have been modified outside of chezmoi and need to be synced back.
disable-model-invocation: true
argument-hint: [target-path...]
---

# Backport Dotfiles to Chezmoi

Sync changes from deployed dotfiles back into the chezmoi source repository.

## Step 1: Detect differences

If `$ARGUMENTS` is provided, treat each argument as a target file path (e.g., `~/.claude/settings.json`) and check only those files. Otherwise, check all managed files.

Run `chezmoi diff` (or `chezmoi diff <path>` for specific files) to find differences between the live system and chezmoi source. The diff output shows what `chezmoi apply` would change — meaning the **target has diverged** from the source.

If there are no differences, tell the user everything is in sync and stop.

## Step 2: Show the differences

For each file with differences:

1. Show the file path (both target and source paths).
2. Show a summary of what changed (added/removed/modified lines).
3. Note if the source file is a template (`.tmpl` extension) — these require manual review.

Use `chezmoi source-path <target-path>` to find the corresponding source file.

## Step 3: Backport changes

For each file with differences:

- **Non-template files**: Run `chezmoi re-add <target-path>` to update the chezmoi source to match the deployed version.
- **Template files (`.tmpl`)**: Read both the deployed file and the source template, then manually update the source template to incorporate the changes while preserving template syntax (e.g., `{{ .email }}`, `{{ .name }}`). Do NOT blindly overwrite template files.

## Step 4: Verify

After backporting, run:

1. `chezmoi diff` to confirm the differences are resolved.
2. `git diff` in the chezmoi repo to review the changes made to source files.

Show the user the final `git diff` output so they can confirm the backport is correct.

---
name: walkthrough
description: 'Generate a walkthrough JSON for the Neovim walkthrough plugin to walk a human through a code execution path — bug explanations, control-flow narration, race-condition timelines, variable evolution.'
disable-model-invocation: true
---

# Code walkthrough

A walkthrough is a single JSON file documenting the execution sequence that produces a bug. Each step pins a `file:line` along the path, the expected values of relevant variables at that point, and a note explaining why this point matters in the chain. The Neovim plugin steps through the file: cursor jumps, line highlights, values render inline as virtual text, and the note shows in a corner float.

## Schema

```json
{
  "description": "stale user returned after concurrent invalidate; cache lookup races with the in-flight invalidate triggered by step 4",
  "commit": "5e75cf3a8b1d4e2f6c0a9b8e7d6c5b4a3f2e1d09",
  "steps": [
    {
      "file": "src/api.ts",
      "line": 6,
      "note": "Caller asks for a user. Cache lookup happens first.\n\nMulti-paragraph notes use \\n.",
      "values": [
        { "name": "id", "value": "\"user:42\"", "line": 5 },
        { "name": "userCache.size", "value": "1", "line": 3 }
      ]
    }
  ]
}
```

Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | recommended | Free-form summary of the bug/path. Metadata only — not rendered in the UI |
| `commit` | string | yes | Full 40-char SHA from `git rev-parse HEAD` (never `--short`) |
| `steps` | array | yes | At least one step |
| `steps[].file` | string | yes | Path relative to git root, forward slashes |
| `steps[].line` | int | yes | 1-indexed |
| `steps[].note` | string | recommended | Markdown allowed, `\n` for newlines |
| `steps[].values` | array | optional | Expected variable state at this point in execution |
| `steps[].values[].name` | string | yes | Variable identifier or expression being observed |
| `steps[].values[].value` | string | yes | Expected value at this point — concrete, JSON-formatted as a string |
| `steps[].values[].line` | int | yes | Line where the value is observed (decl, assignment, call site) |

## Authoring rules

- **One thought per step.** If a step needs two ideas, split it. Use as many steps as the path needs — don't pad, don't compress.
- **`note` says why this point is on the path to the bug.** What invariant holds, what assumption is wrong, what fires next, what it depends on from earlier steps.
- **Always set `values[].line`** to where the variable is most meaningfully observed (parameter declaration, assignment, the call that produced it). The plugin will skip values without `line` and warn — there is no fallback.
- **Values are the expected state at this step**, derived from reasoning about the code path or from real logs/repro. Use concrete forms: `"user:42"`, `1715000060000`, `{ name: "alice" }`. Placeholders like `<some user>` make the trace unverifiable.
- **Sequence racing paths explicitly in `note`.** "Step 4 returns BEFORE step 5 fires."
- **`commit` must match the snapshot the line numbers were captured against.** If you edit the code after authoring, regenerate the walkthrough or re-pin.
- **Paths are repo-relative.** `src/cache.ts`, not `/Users/.../cache.ts` or `./cache.ts`.

## Validation

Always validate before handing the file to the user:

```bash
scripts/validate.ts path/to/walkthrough.json
```

Adds `--check-files` to also confirm every `file` exists in the repo and every `line` is in range:

```bash
scripts/validate.ts path/to/walkthrough.json --check-files
```

Validator exits 0 on success, 1 on schema/file errors, 2 on usage errors.

## Output convention

- **Save the JSON inside the same repo whose code it describes.** The plugin resolves `step.file` paths from the git root of the JSON's directory (`git -C <dir-of-json> rev-parse --show-toplevel`).
- Recommended location: `.claude-works/walkthroughs/<slug>.json` at the repo root.
- After validating, open the walkthrough in a new tmux pane next to the Claude Code pane:
  ```bash
  tmux split-window -h -t "$TMUX_PANE" -c '<repo-root>' "nvim -c 'lua vim.defer_fn(function() require([[walkthrough]]).start([[<abs-path-to-json>]]) end, 100)'"
  ```

  The `vim.defer_fn()` call waits for startup to settle before opening the target source file. Running the walkthrough immediately can open the target file while startup is still in progress, so LSP may not attach until `:e` is run manually. Calling `require([[walkthrough]]).start()` directly also avoids racing the user command registration in `keymaps.lua`.

  Inside Neovim:
  - `]w` / `[w` — next / prev step
  - `<count><leader>wg` — jump to step N (e.g. `3<leader>wg`)
  - `<leader>wt` — toggle the note float
  - `<leader>w<CR>` — focus the float (`q` to leave)
  - `<leader>wR` — reload after editing the JSON

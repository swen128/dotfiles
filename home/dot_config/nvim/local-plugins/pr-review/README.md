# pr-review

GitHub PR review inside Neovim, on top of your **real working-tree files** — so LSP code navigation (`gd`, `gr`, `K`, …) keeps working while you review. Each changed file opens as a native vimdiff against the PR's merge-base; review comments are shown as signs and virtual text, and you can read, add, edit, and react to them without leaving the editor.

All GitHub access goes through the `gh` CLI (no token configuration needed).

## Requirements

- Neovim 0.10+
- `gh` CLI, authenticated (`gh auth status`)
- [fzf-lua](https://github.com/ibhagwan/fzf-lua) (pickers)
- Run Neovim inside the repository of the PR you want to review

## Usage

| Command | Action |
| --- | --- |
| `:Pr` / `:Pr dash` | Open the PR dashboard (gh-dash style split with preview, see below) |
| `:Pr open [n]` | Review the current branch's PR, or PR number `n` |
| `:Pr files` | Pick a changed file |
| `:Pr comment` | Comment on the current line (also works with a visual range) |
| `:Pr thread` | Show the comment thread under the cursor |
| `:Pr threads` | Pick from all threads, including outdated ones |
| `:Pr submit` | Submit the review (approve / request changes / comment), flushing pending comments |
| `:Pr discard` | Discard all pending review comments |
| `:Pr merge` | Merge the PR (pick squash / merge / rebase, optionally delete the branch) |
| `:Pr automerge` | Enable auto-merge (squash / merge / rebase) or disable it |
| `:Pr draft` | Toggle the PR between draft and ready for review |
| `:Pr refresh` | Refetch comments |
| `:Pr viewed` | Toggle the current file's viewed state |
| `:Pr checkout` | `gh pr checkout` in your main working tree and switch the session to it |
| `:Pr status` | Show current session info |
| `:Pr close` | End the review session |

When your local `HEAD` is not the PR head, starting a review runs `gh pr checkout` — you land on the PR branch with full LSP. If that checkout fails (e.g. uncommitted changes that conflict), the plugin falls back to a persistent detached worktree under `~/.cache/nvim/pr-review/` (fetching `pull/N/head` when needed) and opens the real files there read-only, leaving your tree alone; `:Pr checkout` retries the branch checkout once you've cleaned up.

### Dashboard

`:Pr` opens a gh-dash-style dashboard in a new tab: a columnar PR list on the left and a live preview pane on the right. Sections are **tabs** along the top (e.g. **Needs your review**, **Created by you**) with counts; switch with `<Tab>`/`<S-Tab>` or `H`/`L`. Each row shows a review-state badge (`●` review required, `✓` approved, `✗` changes requested, `◌` draft), title, comment count, CI status (`✓`/`✗`/`●`), diff stats, and age. The preview (rendered from data fetched upfront, so it's instant) shows the repo/number, state and branch, reviewers with their states, labels, changes, a checks box (review decision + CI summary + whether merging is blocked), and the description. `⏎` starts reviewing the PR under the cursor, `o` opens it on GitHub, `R` refreshes, `q` closes.

Sections are search-qualifier driven and configurable:

```lua
opts = {
  dash = {
    limit = 30,
    sections = {
      { title = " Needs your review", search = "review-requested:@me" },
      { title = " Created by you", search = "author:@me" },
    },
  },
}
```

### Review buffers

The file picker (`:Pr files` / `<leader>rf`) and the thread picker (`<leader>rT`) are fzf-lua floats with a live preview — the file picker shows the file's diff, the thread picker shows the full conversation. Opening a file shows the merge-base version on the left and the working-tree file on the right, diffed. The right side is the real file: jump to definitions, grep, edit — everything works. Lines with review threads get a `󰅺` sign and an eol summary.

Default buffer-local keymaps (configurable via `setup`, set to `false` to disable):

| Map | Action |
| --- | --- |
| `<leader>rf` | Pick file |
| `<leader>rc` | Comment on line / visual range |
| `<leader>rt` | Show thread under cursor |
| `<leader>rT` | Pick from all threads |
| `<leader>rs` | Submit review |
| `<leader>rr` | Refresh comments |
| `<leader>rd` | Toggle the PR between draft and ready for review |
| `<leader>rv` | Toggle the current file as viewed |
| `]C` / `[C` | Next / previous commented line |
| `]F` / `[F` | Next / previous changed file (marks the file you leave as viewed) |

Inside a thread float: `r` reply, `e` edit your own comment, `a` toggle a reaction, `o` open in browser, `q` close.

In a comment compose window: `<C-s>` adds the comment to your pending review, `<C-a>` (or `<C-CR>`) posts it immediately as a single comment, `q` cancels. In the review-summary compose: `<C-s>` submits, `q` cancels.

### Viewed files

Mirrors GitHub's per-file "Viewed" checkbox (read and written via GraphQL, and auto-cleared by GitHub when the author pushes a change to a file). `<leader>rv` toggles the current file. The file picker shows a `✓` next to viewed files and a `viewed/total` count in its prompt. By default, moving to the next/previous file marks the file you're leaving as viewed (`auto_mark_viewed = true`); set `skip_viewed = true` to have `]F`/`[F` jump over already-viewed files.

### Comments and reviews

A comment can either be **posted immediately** as a single comment (`<C-a>` in the compose window) or **added to a pending review** (`<C-s>`) and sent all at once when you submit the review. Pending comments are shown with a `▶` sign and `pending:` text, and are local until you submit — `:Pr submit` posts them together with the verdict (approve / request changes / comment), and `:Pr discard` throws them away.

Comments added from the right (working-tree) buffer are posted on the `RIGHT` side of the diff; comments added from the left (base) buffer go to the `LEFT` side.

### Merging

`:Pr merge` and `:Pr automerge` act on the active session's PR, each confirming before doing anything. `:Pr merge` picks the method and optionally deletes the branch; `:Pr automerge` enables/disables GitHub auto-merge (which the repo must allow, with required checks configured). The dashboard preview shows a `mergeable` line when GitHub has computed it — it's best-effort, since GitHub computes mergeability lazily and a fresh list query often returns `UNKNOWN` (the line is hidden then).

## Setup (lazy.nvim)

```lua
{
  dir = vim.fn.stdpath("config") .. "/local-plugins/pr-review",
  name = "pr-review",
  cmd = "Pr",
  opts = {},
}
```

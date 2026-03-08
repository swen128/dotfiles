#!/usr/bin/env zsh

# ==========================
# ws (workspace) command
# ==========================

# Resolve owner/repo from current git context.
# Sets _ws_owner, _ws_repo, _ws_base_dir, _ws_state_file, _ws_main_repo
function _ws_resolve_repo() {
  local WT_ROOT="$HOME/worktrees"

  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "[ws] Error: Not inside a Git repository"
    return 1
  }

  # If we're in a worktree, find the main repo
  _ws_main_repo="$repo_root"
  if [[ -f "$repo_root/.git" ]]; then
    local gitdir_line
    gitdir_line=$(<"$repo_root/.git")
    if [[ "$gitdir_line" =~ ^gitdir:\ (.+)/\.git/worktrees/.+ ]]; then
      _ws_main_repo="${match[1]}"
    fi
  fi

  local remote_url
  remote_url=$(git config --get remote.origin.url 2>/dev/null)
  if [[ "$remote_url" =~ github.com[:/]([^/]+)/([^/]+)(\.git)?$ ]]; then
    _ws_owner="${match[1]}"
    _ws_repo="${match[2]%.git}"
  else
    echo "[ws] Error: Unsupported or missing remote URL: $remote_url"
    return 1
  fi

  _ws_base_dir="$WT_ROOT/$_ws_owner/$_ws_repo"
  _ws_state_file="$_ws_base_dir/.workspaces"
}

# Check if a worktree directory is in detached HEAD state
function _ws_is_detached() {
  local dir="$1"
  local head_ref
  head_ref=$(cd "$dir" && git rev-parse --symbolic-full-name HEAD 2>/dev/null)
  [[ "$head_ref" == "HEAD" ]]
}

# Find an idle worktree (detached HEAD, not in state file)
# Sets _ws_idle_dir on success
function _ws_find_idle() {
  _ws_idle_dir=""
  local dir
  for dir in "$_ws_base_dir"/*(N/); do
    local dir_name="${dir:t}"
    # Skip if listed in state file
    if [[ -f "$_ws_state_file" ]] && grep -q $'\t'"$dir_name"$ "$_ws_state_file" 2>/dev/null; then
      continue
    fi
    if _ws_is_detached "$dir"; then
      _ws_idle_dir="$dir"
      return 0
    fi
  done
  return 1
}

function ws() {
  local subcommand="$1"
  shift 2>/dev/null

  case "$subcommand" in
    new)  _ws_new "$@" ;;
    done) _ws_done "$@" ;;
    go)   _ws_go "$@" ;;
    status) _ws_status "$@" ;;
    *)
      echo "Usage: ws <subcommand>"
      echo ""
      echo "Subcommands:"
      echo "  new <name>      Claim an idle worktree for a new workspace"
      echo "  done [--force]  Release the current workspace"
      echo "  go [name]       Go to a workspace (no args = main worktree)"
      echo "  status          Show current and active workspaces"
      return 1
      ;;
  esac
}

function _ws_new() {
  local name="$1"
  if [[ -z "$name" ]]; then
    echo "[ws new] Error: Workspace name required"
    echo "Usage: ws new <name>"
    return 1
  fi

  _ws_resolve_repo || return 1

  # Check for duplicate workspace name
  if [[ -f "$_ws_state_file" ]] && grep -q "^${name}"$'\t' "$_ws_state_file" 2>/dev/null; then
    echo "[ws new] Error: Workspace '$name' already exists"
    return 1
  fi

  # Find an idle worktree
  if ! _ws_find_idle; then
    echo "[ws new] Error: No idle worktrees available"
    echo "Create worktrees with 'gw <name>' and release them with 'ws done' to build the pool"
    return 1
  fi

  local target_dir="$_ws_idle_dir"
  local dir_name="${target_dir:t}"

  # Fetch and create branch
  local default_branch
  default_branch=$(git remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF}')
  default_branch=${default_branch:-main}

  echo "[ws new] Claiming worktree '$dir_name' as workspace '$name'"
  (cd "$target_dir" && git fetch origin "$default_branch" && git checkout -b "$name" "origin/$default_branch") || {
    echo "[ws new] Error: Failed to create branch '$name'"
    return 1
  }

  # Record in state file
  mkdir -p "$_ws_base_dir"
  printf '%s\t%s\n' "$name" "$dir_name" >> "$_ws_state_file"

  echo "[ws new] Workspace '$name' ready at $target_dir"
  cd "$target_dir" || return 1
}

function _ws_done() {
  local force=false
  if [[ "$1" == "--force" ]]; then
    force=true
  fi

  _ws_resolve_repo || return 1

  # Check we're in a pool worktree
  local current_root
  current_root=$(git rev-parse --show-toplevel 2>/dev/null)
  if [[ ! "$current_root" =~ ^"$_ws_base_dir"/ ]]; then
    echo "[ws done] Error: Not inside a pool worktree"
    return 1
  fi

  local dir_name="${current_root:t}"

  # Find the workspace name for this worktree
  local ws_name=""
  if [[ -f "$_ws_state_file" ]]; then
    ws_name=$(grep $'\t'"${dir_name}$" "$_ws_state_file" | cut -f1)
  fi
  if [[ -z "$ws_name" ]]; then
    echo "[ws done] Error: This worktree is not a claimed workspace"
    return 1
  fi

  # Check for dirty working tree
  if [[ -n "$(cd "$current_root" && git status --porcelain 2>/dev/null)" ]]; then
    if [[ "$force" == true ]]; then
      echo "[ws done] Committing uncommitted changes..."
      (cd "$current_root" && git add -A && git commit --no-verify -m "wip: auto-commit from ws done --force") || {
        echo "[ws done] Error: Failed to commit changes"
        return 1
      }
    else
      echo "[ws done] Error: Working tree has uncommitted changes"
      echo "Clean up first, or use 'ws done --force' to auto-commit"
      return 1
    fi
  fi

  # Warn about unpushed commits
  local current_branch
  current_branch=$(cd "$current_root" && git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [[ -n "$current_branch" && "$current_branch" != "HEAD" ]]; then
    local upstream="origin/$current_branch"
    local unpushed
    unpushed=$(cd "$current_root" && git log "$upstream..HEAD" --oneline 2>/dev/null)
    if [[ -n "$unpushed" ]]; then
      echo "[ws done] Warning: Unpushed commits on '$current_branch':"
      echo "$unpushed"
      echo -n "Continue? [Enter = Yes, Ctrl+C = Cancel] "
      read
    fi
  fi

  # Detach HEAD
  (cd "$current_root" && git checkout --detach) || {
    echo "[ws done] Error: Failed to detach HEAD"
    return 1
  }

  # Delete branch if safe (fully merged into origin default branch)
  if [[ -n "$current_branch" && "$current_branch" != "HEAD" ]]; then
    if (cd "$current_root" && git branch -d "$current_branch" 2>/dev/null); then
      echo "[ws done] Deleted branch '$current_branch' (was fully merged)"
    else
      echo "[ws done] Kept branch '$current_branch' (not fully merged)"
    fi
  fi

  # Remove from state file
  local tmp_file="${_ws_state_file}.tmp"
  grep -v $'\t'"${dir_name}$" "$_ws_state_file" > "$tmp_file" 2>/dev/null
  mv "$tmp_file" "$_ws_state_file"
  # Remove state file if empty
  [[ ! -s "$_ws_state_file" ]] && rm -f "$_ws_state_file"

  echo "[ws done] Released workspace '$ws_name'"
  cd "$_ws_main_repo" || return 1
}

function _ws_go() {
  local name="$1"

  _ws_resolve_repo || return 1

  # No argument: go to main worktree
  if [[ -z "$name" ]]; then
    cd "$_ws_main_repo" || return 1
    return 0
  fi

  if [[ ! -f "$_ws_state_file" ]]; then
    echo "[ws go] Error: No active workspaces"
    return 1
  fi

  local dir_name
  dir_name=$(grep "^${name}"$'\t' "$_ws_state_file" | cut -f2)
  if [[ -z "$dir_name" ]]; then
    echo "[ws go] Error: Workspace '$name' not found"
    echo ""
    echo "Active workspaces:"
    cut -f1 "$_ws_state_file" | sed 's/^/  /'
    return 1
  fi

  local target_dir="$_ws_base_dir/$dir_name"
  if [[ ! -d "$target_dir" ]]; then
    echo "[ws go] Error: Worktree directory '$target_dir' no longer exists"
    return 1
  fi

  cd "$target_dir" || return 1
}

function _ws_status() {
  _ws_resolve_repo || return 1

  # Determine current workspace
  local current_root
  current_root=$(git rev-parse --show-toplevel 2>/dev/null)
  local current_ws=""
  if [[ -f "$_ws_state_file" && "$current_root" =~ ^"$_ws_base_dir"/ ]]; then
    local current_dir="${current_root:t}"
    current_ws=$(grep $'\t'"${current_dir}$" "$_ws_state_file" 2>/dev/null | cut -f1)
  fi

  if [[ -n "$current_ws" ]]; then
    echo "Current workspace: $current_ws"
  else
    echo "Current workspace: (not inside any workspace)"
  fi
  echo ""

  # Count idle worktrees
  local idle_count=0
  local dir
  for dir in "$_ws_base_dir"/*(N/); do
    local dir_name="${dir:t}"
    if [[ -f "$_ws_state_file" ]] && grep -q $'\t'"$dir_name"$ "$_ws_state_file" 2>/dev/null; then
      continue
    fi
    if _ws_is_detached "$dir"; then
      ((idle_count++))
    fi
  done

  # Show active workspaces
  if [[ -f "$_ws_state_file" && -s "$_ws_state_file" ]]; then
    echo "Active workspaces:"
    while IFS=$'\t' read -r name dir_name; do
      local wt_dir="$_ws_base_dir/$dir_name"
      local branch="(unknown)"
      if [[ -d "$wt_dir" ]]; then
        branch=$(cd "$wt_dir" && git rev-parse --abbrev-ref HEAD 2>/dev/null)
      fi
      local marker=""
      [[ "$name" == "$current_ws" ]] && marker=" *"
      echo "  $name  ($branch)$marker"
    done < "$_ws_state_file"
  else
    echo "No active workspaces"
  fi

  echo ""
  echo "Idle worktrees: $idle_count"
}

# ==========================
# ws completion (_ws)
# ==========================
function _ws() {
  local WT_ROOT="$HOME/worktrees"

  if [[ ${#words[@]} -eq 2 ]]; then
    local -a subcommands
    subcommands=(
      "new:Claim an idle worktree for a new workspace"
      "done:Release the current workspace"
      "go:Go to a workspace by name"
      "status:Show current and active workspaces"
    )
    _describe -t subcommands 'subcommand' subcommands
  elif [[ ${#words[@]} -eq 3 && "${words[2]}" == "go" ]]; then
    local remote_url=$(git config --get remote.origin.url 2>/dev/null)
    [[ "$remote_url" =~ github.com[:/]([^/]+)/([^/]+)(\.git)?$ ]] || return
    local owner="${match[1]}"
    local repo="${match[2]%.git}"
    local state_file="$WT_ROOT/$owner/$repo/.workspaces"
    if [[ -f "$state_file" ]]; then
      local -a names
      names=(${(f)"$(cut -f1 "$state_file" 2>/dev/null)"})
      compadd -Q -- "${names[@]}"
    fi
  fi
}
compdef _ws ws

alias w='ws go'

function _w() {
  local WT_ROOT="$HOME/worktrees"
  local remote_url=$(git config --get remote.origin.url 2>/dev/null)
  [[ "$remote_url" =~ github.com[:/]([^/]+)/([^/]+)(\.git)?$ ]] || return
  local owner="${match[1]}"
  local repo="${match[2]%.git}"
  local state_file="$WT_ROOT/$owner/$repo/.workspaces"
  if [[ -f "$state_file" ]]; then
    local -a names
    names=(${(f)"$(cut -f1 "$state_file" 2>/dev/null)"})
    compadd -Q -- "${names[@]}"
  fi
}
compdef _w w

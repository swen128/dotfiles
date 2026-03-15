#!/usr/bin/env zsh

# ==========================
# ws (workspace) command
# ==========================
# A workspace is a git worktree with a branch checked out.
# Workspace name = branch name.

# Parse `git worktree list --porcelain` output.
# Sets arrays: _ws_wt_paths, _ws_wt_branches, _ws_wt_is_main
# Branch is empty string for detached HEAD worktrees.
function _ws_list_worktrees() {
  _ws_wt_paths=()
  _ws_wt_branches=()
  _ws_wt_is_main=()

  local output
  output=$(git worktree list --porcelain 2>/dev/null) || return

  local path="" branch=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^worktree\ (.+) ]]; then
      path="${match[1]}"
    elif [[ "$line" == "branch refs/heads/"* ]]; then
      branch="${line#branch refs/heads/}"
    elif [[ "$line" == "detached" ]]; then
      branch=""
    elif [[ -z "$line" ]]; then
      if [[ -n "$path" ]]; then
        _ws_wt_paths+=("$path")
        _ws_wt_branches+=("$branch")
        if [[ ${#_ws_wt_paths[@]} -eq 1 ]]; then
          _ws_wt_is_main+=(true)
        else
          _ws_wt_is_main+=(false)
        fi
      fi
      path=""
      branch=""
    fi
  done <<< "$output"

  if [[ -n "$path" ]]; then
    _ws_wt_paths+=("$path")
    _ws_wt_branches+=("$branch")
    if [[ ${#_ws_wt_paths[@]} -eq 1 ]]; then
      _ws_wt_is_main+=(true)
    else
      _ws_wt_is_main+=(false)
    fi
  fi
}

# Get the main worktree path
function _ws_main_worktree() {
  _ws_list_worktrees
  echo "${_ws_wt_paths[1]}"
}

function ws() {
  local subcommand="$1"
  shift 2>/dev/null

  case "$subcommand" in
    switch)          _ws_switch "$@" ;;
    done)            _ws_done "$@" ;;
    status)          _ws_status "$@" ;;
    create-worktree) _ws_create_worktree "$@" ;;
    *)
      echo "Usage: ws <subcommand>"
      echo ""
      echo "Subcommands:"
      echo "  switch <name>          Switch to or create a workspace"
      echo "  done [--force]         Release the current workspace"
      echo "  status                 Show current and active workspaces"
      echo "  create-worktree [path] Add a new idle worktree"
      return 1
      ;;
  esac
}

function _ws_switch() {
  local name="$1"

  git rev-parse --show-toplevel &>/dev/null || {
    echo "[ws switch] Error: Not inside a Git repository"
    return 1
  }

  # No name: switch to the main worktree
  if [[ -z "$name" ]]; then
    local main_wt
    main_wt=$(_ws_main_worktree)
    echo "[ws switch] Switching to main worktree: $main_wt"
    cd "$main_wt" || return 1
    return 0
  fi

  _ws_list_worktrees

  # Check if a pool worktree already has this branch checked out
  local i
  for i in {1..${#_ws_wt_paths[@]}}; do
    if [[ "${_ws_wt_is_main[$i]}" == "true" ]]; then
      continue
    fi
    if [[ "${_ws_wt_branches[$i]}" == "$name" ]]; then
      echo "[ws switch] Workspace '$name' at ${_ws_wt_paths[$i]}"
      cd "${_ws_wt_paths[$i]}" || return 1
      return 0
    fi
  done

  # Find an idle worktree (detached HEAD, non-main)
  local idle_dir=""
  for i in {1..${#_ws_wt_paths[@]}}; do
    if [[ "${_ws_wt_is_main[$i]}" == "true" ]]; then
      continue
    fi
    if [[ -z "${_ws_wt_branches[$i]}" ]]; then
      idle_dir="${_ws_wt_paths[$i]}"
      break
    fi
  done

  if [[ -z "$idle_dir" ]]; then
    echo "[ws switch] Error: No idle worktrees available"
    return 1
  fi

  echo "[ws switch] Claiming worktree at $idle_dir"

  # Branch resolution: (a) local branch, (b) remote origin/<name>, (c) new from origin/<default-branch>
  if (cd "$idle_dir" && git show-ref --verify --quiet "refs/heads/$name" 2>/dev/null); then
    # (a) Existing local branch
    (cd "$idle_dir" && git checkout "$name") || {
      echo "[ws switch] Error: Failed to check out branch '$name'"
      return 1
    }
  else
    # Fetch to ensure we have up-to-date remote refs
    (cd "$idle_dir" && git fetch origin 2>/dev/null)

    if (cd "$idle_dir" && git show-ref --verify --quiet "refs/remotes/origin/$name" 2>/dev/null); then
      # (b) Existing remote branch — create tracking branch
      (cd "$idle_dir" && git checkout -b "$name" --track "origin/$name") || {
        echo "[ws switch] Error: Failed to check out remote branch '$name'"
        return 1
      }
    else
      # (c) New branch from origin/<default-branch>
      local default_branch
      default_branch=$(git remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF}')
      default_branch=${default_branch:-main}

      (cd "$idle_dir" && git checkout --no-track -b "$name" "origin/$default_branch") || {
        echo "[ws switch] Error: Failed to create branch '$name'"
        return 1
      }
    fi
  fi

  echo "[ws switch] Workspace '$name' ready"
  cd "$idle_dir" || return 1
}

function _ws_done() {
  local force=false
  if [[ "$1" == "--force" ]]; then
    force=true
  fi

  local current_root
  current_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "[ws done] Error: Not inside a Git repository"
    return 1
  }

  _ws_list_worktrees

  # Check we're in a pool worktree (non-main)
  local is_pool=false
  local current_branch=""
  local i
  for i in {1..${#_ws_wt_paths[@]}}; do
    if [[ "${_ws_wt_paths[$i]}" == "$current_root" && "${_ws_wt_is_main[$i]}" == "false" ]]; then
      is_pool=true
      current_branch="${_ws_wt_branches[$i]}"
      break
    fi
  done

  if [[ "$is_pool" == "false" ]]; then
    echo "[ws done] Error: Not inside a pool worktree"
    return 1
  fi

  if [[ -z "$current_branch" ]]; then
    echo "[ws done] Error: Already idle (detached HEAD)"
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
  local upstream warn=false
  upstream=$(cd "$current_root" && git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" 2>/dev/null)
  if [[ -z "$upstream" ]]; then
    echo "[ws done] Warning: Branch '$current_branch' has no upstream (never pushed)"
    warn=true
  else
    local unpushed
    unpushed=$(cd "$current_root" && git log "$upstream..HEAD" --oneline 2>/dev/null)
    if [[ -n "$unpushed" ]]; then
      echo "[ws done] Warning: Unpushed commits on '$current_branch':"
      echo "$unpushed"
      warn=true
    fi
  fi
  if [[ "$warn" == true && "$force" == false ]]; then
    echo -n "Continue? [Enter = Yes, Ctrl+C = Cancel] "
    read
  fi

  # Detach HEAD
  (cd "$current_root" && git checkout --detach) || {
    echo "[ws done] Error: Failed to detach HEAD"
    return 1
  }

  # Safe delete branch
  if (cd "$current_root" && git branch -d "$current_branch" 2>/dev/null); then
    echo "[ws done] Deleted branch '$current_branch' (was fully merged)"
  else
    echo "[ws done] Kept branch '$current_branch' (not fully merged)"
  fi

  local main_wt="${_ws_wt_paths[1]}"
  echo "[ws done] Released workspace '$current_branch'"
  cd "$main_wt" || return 1
}

function _ws_status() {
  _ws_list_worktrees

  local current_root
  current_root=$(git rev-parse --show-toplevel 2>/dev/null)

  # Determine current workspace
  local current_ws=""
  local i
  for i in {1..${#_ws_wt_paths[@]}}; do
    if [[ "${_ws_wt_paths[$i]}" == "$current_root" && "${_ws_wt_is_main[$i]}" == "false" && -n "${_ws_wt_branches[$i]}" ]]; then
      current_ws="${_ws_wt_branches[$i]}"
      break
    fi
  done

  if [[ -n "$current_ws" ]]; then
    echo "Current workspace: $current_ws"
  else
    echo "Current workspace: (not inside any workspace)"
  fi
  echo ""

  # Collect active and idle counts
  local has_active=false
  local idle_count=0
  local active_lines=()

  for i in {1..${#_ws_wt_paths[@]}}; do
    if [[ "${_ws_wt_is_main[$i]}" == "true" ]]; then
      continue
    fi
    if [[ -n "${_ws_wt_branches[$i]}" ]]; then
      has_active=true
      local marker=""
      [[ "${_ws_wt_branches[$i]}" == "$current_ws" ]] && marker=" *"
      active_lines+=("  ${_ws_wt_branches[$i]}$marker")
    else
      ((idle_count++))
    fi
  done

  if [[ "$has_active" == true ]]; then
    echo "Active workspaces:"
    for line in "${active_lines[@]}"; do
      echo "$line"
    done
  else
    echo "No active workspaces"
  fi

  echo ""
  echo "Idle worktrees: $idle_count"
}

function _ws_create_worktree() {
  local target_path="$1"

  git rev-parse --show-toplevel &>/dev/null || {
    echo "[ws create-worktree] Error: Not inside a Git repository"
    return 1
  }

  if [[ -z "$target_path" ]]; then
    # Parse owner/repo from remote URL, fall back to _/<repo> when no remote
    local remote_url owner repo
    remote_url=$(git config --get remote.origin.url 2>/dev/null)
    if [[ "$remote_url" =~ github.com[:/]([^/]+)/([^/]+)(\.git)?$ ]]; then
      owner="${match[1]}"
      repo="${match[2]%.git}"
    else
      owner="_"
      repo=$(basename "$(git rev-parse --show-toplevel)")
    fi

    local base_dir="$HOME/worktrees/$owner/$repo"
    local n=1
    while [[ -d "$base_dir/wt-$n" ]]; do
      ((n++))
    done
    target_path="$base_dir/wt-$n"
  fi

  if [[ -e "$target_path" ]]; then
    echo "[ws create-worktree] Error: Path already exists: $target_path"
    return 1
  fi

  mkdir -p "$(dirname "$target_path")"
  git worktree add --detach "$target_path" || {
    echo "[ws create-worktree] Error: Failed to create worktree"
    return 1
  }

  echo "[ws create-worktree] Created idle worktree at $target_path"
}

# ==========================
# Completion
# ==========================

# Helper: get active workspace names (branches in pool worktrees)
function _ws_active_names() {
  local output
  output=$(git worktree list --porcelain 2>/dev/null) || return

  local path="" branch="" is_first=true
  while IFS= read -r line; do
    if [[ "$line" =~ ^worktree\ (.+) ]]; then
      path="${match[1]}"
    elif [[ "$line" == "branch refs/heads/"* ]]; then
      branch="${line#branch refs/heads/}"
    elif [[ "$line" == "detached" ]]; then
      branch=""
    elif [[ -z "$line" ]]; then
      if [[ "$is_first" == true ]]; then
        is_first=false
      elif [[ -n "$branch" ]]; then
        echo "$branch"
      fi
      path=""
      branch=""
    fi
  done <<< "$output"

  if [[ -n "$path" && "$is_first" == false && -n "$branch" ]]; then
    echo "$branch"
  fi
}

function _ws() {
  if [[ ${#words[@]} -eq 2 ]]; then
    local -a subcommands
    subcommands=(
      "switch:Switch to or create a workspace"
      "done:Release the current workspace"
      "status:Show current and active workspaces"
      "create-worktree:Add a new idle worktree"
    )
    _describe -t subcommands 'subcommand' subcommands
  elif [[ ${#words[@]} -eq 3 && "${words[2]}" == "switch" ]]; then
    local -a names
    names=(${(f)"$(_ws_active_names)"})
    compadd -Q -- "${names[@]}"
  fi
}
compdef _ws ws

function w() { ws switch "$@" }

function _w() {
  local -a names
  names=(${(f)"$(_ws_active_names)"})
  compadd -Q -- "${names[@]}"
}
compdef _w w

#!/usr/bin/env zsh

# Resolve the absolute path of git-common-dir for the given directory.
# All worktrees of the same repo share the same git-common-dir.
function _git_common_dir() {
    local dir="${1:-.}"
    local common_dir
    common_dir=$(git -C "$dir" rev-parse --git-common-dir 2>/dev/null) || return 1
    # Resolve to absolute path (git may return relative)
    (cd "$dir" && cd "$common_dir" && pwd -P)
}

# If zoxide_result is in a sibling worktree of the same repo, remap to
# the equivalent path in the current worktree and cd there.
# Returns 0 if remapped, 1 if no remapping needed.
function _remap_worktree_path() {
    local zoxide_result="$1"
    local current_toplevel current_common target_toplevel target_common

    current_toplevel=$(git rev-parse --show-toplevel 2>/dev/null) || return 1
    current_common=$(_git_common_dir "$current_toplevel") || return 1

    [[ -d "$zoxide_result" ]] || return 1
    target_toplevel=$(git -C "$zoxide_result" rev-parse --show-toplevel 2>/dev/null) || return 1
    target_common=$(_git_common_dir "$target_toplevel") || return 1

    # Same repo, different worktree?
    [[ "$target_common" == "$current_common" && "$target_toplevel" != "$current_toplevel" ]] || return 1

    local relative_path="${zoxide_result#$target_toplevel}"
    relative_path="${relative_path#/}"

    if [[ -z "$relative_path" ]]; then
        cd "$current_toplevel"
    elif [[ -d "$current_toplevel/$relative_path" ]]; then
        cd "$current_toplevel/$relative_path"
    else
        cd "$current_toplevel"
    fi
    return 0
}

# Worktree-aware zoxide wrapper
function z() {
    local zoxide_result
    zoxide_result=$(zoxide query -- "$@" 2>/dev/null) || {
        __zoxide_z "$@"
        return
    }

    _remap_worktree_path "$zoxide_result" && return 0
    __zoxide_z "$@"
}

# Worktree-aware zoxide interactive wrapper
function zi() {
    local zoxide_result
    zoxide_result=$(zoxide query -i -- "$@" 2>/dev/null)
    local exit_code=$?
    if [[ $exit_code -ne 0 ]] || [[ -z "$zoxide_result" ]]; then
        return $exit_code
    fi

    _remap_worktree_path "$zoxide_result" && return 0
    cd "$zoxide_result"
}

# ==========================
# gw function
# ==========================
function gw() {
  local WT_ROOT="$HOME/worktrees"
  local subcommand="$1"
  local wt_name="$2"
  
  # Get current Git repository root
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "Not inside a Git repository"
    return 1
  }
  
  # Parse GitHub remote URL to get owner and repo name
  local remote_url
  remote_url=$(git config --get remote.origin.url)
  if [[ "$remote_url" =~ github.com[:/]([^/]+)/([^/]+)(\.git)?$ ]]; then
    local owner="${match[1]}"
    local repo="${match[2]%.git}"
  else
    echo "Unsupported or missing remote URL: $remote_url"
    return 1
  fi
  
  # Handle 'rm' subcommand
  if [[ "$subcommand" == "rm" ]]; then
    if [[ -z "$wt_name" ]]; then
      echo "[gw rm] Error: Worktree name required"
      echo "Usage: gw rm <worktree-name>"
      return 1
    fi
    
    local base_dir="$WT_ROOT/$owner/$repo"
    local target_dir="$base_dir/$wt_name"
    
    # Check if worktree exists
    if [[ ! -d "$target_dir" ]]; then
      echo "[gw rm] Error: Worktree '$wt_name' does not exist at $target_dir"
      return 1
    fi
    
    # Get the main repo path to run git commands from there
    local main_repo_path="$repo_root"
    if [[ -f "$repo_root/.git" ]]; then
      local gitdir_line
      gitdir_line=$(<"$repo_root/.git")
      if [[ "$gitdir_line" =~ ^gitdir:\ (.+)/\.git/worktrees/.+ ]]; then
        main_repo_path="${match[1]}"
      fi
    fi
    
    echo "[gw rm] Removing worktree: $target_dir"
    
    # Change to main repo to run the git worktree remove command
    (cd "$main_repo_path" && git worktree remove "$target_dir" 2>&1) || {
      echo "[gw rm] Failed to remove worktree. You may need to use 'git worktree remove --force' if there are uncommitted changes."
      return 1
    }
    
    echo "[gw rm] Successfully removed worktree '$wt_name'"
    
    # Clean up empty parent directories if they exist
    rmdir "$base_dir" 2>/dev/null
    rmdir "$WT_ROOT/$owner" 2>/dev/null
    
    return 0
  fi
  
  # Original behavior when no subcommand or subcommand is a worktree name
  wt_name="$subcommand"  # First argument is the worktree name, not a subcommand
  
  # If no argument: go to main repository (even from a worktree)
  if [[ -z "$wt_name" ]]; then
    if [[ -f "$repo_root/.git" ]]; then
      local gitdir_line
      gitdir_line=$(<"$repo_root/.git")
      if [[ "$gitdir_line" =~ ^gitdir:\ (.+)/\.git/worktrees/.+ ]]; then
        local main_repo_path="${match[1]}"
        echo "[gw] Moving to main repository: $main_repo_path"
        cd "$main_repo_path" || return 1
        return 0
      fi
    fi
    echo "[gw] Already in main repository: $repo_root"
    cd "$repo_root" || return 1
    return 0
  fi
  
  local base_dir="$WT_ROOT/$owner/$repo"
  local target_dir="$base_dir/$wt_name"
  
  if [[ -d "$target_dir" ]]; then
    echo "[gw] Switching to existing worktree: $target_dir"
    cd "$target_dir" || return 1
    return 0
  fi
  
  echo "[gw] Worktree does not exist: $target_dir"
  echo -n "Create new worktree from origin/<default-branch>? [Enter = Yes, Ctrl+C = Cancel] "
  read
  
  # Only here: determine default branch from remote
  local default_branch
  default_branch=$(git remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF}')
  default_branch=${default_branch:-main}
  
  echo "[gw] Creating new worktree '$wt_name' from origin/$default_branch"
  mkdir -p "$base_dir"
  git fetch origin "$default_branch"
  git worktree add "$target_dir" "origin/$default_branch" || return 1
  cd "$target_dir" || return 1
}

# ==========================
# gw completion (_gw)
# ==========================
function _gw() {
  local WT_ROOT="$HOME/worktrees"
  local remote_url=$(git config --get remote.origin.url 2>/dev/null)
  [[ "$remote_url" =~ github.com[:/]([^/]+)/([^/]+)(\.git)?$ ]] || return
  local owner="${match[1]}"
  local repo="${match[2]%.git}"
  local base_dir="$WT_ROOT/$owner/$repo"
  
  # Check if we're completing the first argument (subcommand or worktree name)
  if [[ ${#words[@]} -eq 2 ]]; then
    # First, add the 'rm' subcommand as an option
    local -a options
    options=("rm:Remove a worktree")
    
    # Then add existing worktrees
    if [[ -d "$base_dir" ]]; then
      local -a worktrees
      worktrees=(${(f)"$(find "$base_dir" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null)"})
      
      # Use _describe to show both subcommands and worktrees
      _describe -t subcommands 'subcommand' options
      compadd -Q -- "${worktrees[@]}"
    else
      _describe -t subcommands 'subcommand' options
    fi
  # If the first argument is 'rm', complete with worktree names
  elif [[ ${#words[@]} -eq 3 && "${words[2]}" == "rm" ]]; then
    if [[ -d "$base_dir" ]]; then
      local -a worktrees
      worktrees=(${(f)"$(find "$base_dir" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null)"})
      compadd -Q -- "${worktrees[@]}"
    fi
  fi
}
compdef _gw gw
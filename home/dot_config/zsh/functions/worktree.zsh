#!/usr/bin/env zsh

# Git-aware zoxide wrapper
function z() {
    # Quick check if we have a .git file (indicates worktree)
    if [[ -f .git ]]; then
        # Read the gitdir path from .git file
        local gitdir_line="$(head -n1 .git 2>/dev/null)"
        
        # Check if it's a worktree by looking for "gitdir:" prefix
        if [[ "$gitdir_line" =~ ^gitdir:.*/.git/worktrees/ ]]; then
            # Extract paths efficiently
            local worktree_root="$PWD"
            while [[ ! -f "$worktree_root/.git" ]] && [[ "$worktree_root" != "/" ]]; do
                worktree_root="$(dirname "$worktree_root")"
            done
            
            # Get the main repo path from gitdir
            local main_repo_root="${gitdir_line#gitdir: }"
            main_repo_root="${main_repo_root%/.git/worktrees/*}"
            
            # Query zoxide for the target
            local zoxide_result="$(zoxide query -- "$@" 2>/dev/null)"
            
            if [[ -n "$zoxide_result" ]] && [[ "$zoxide_result" == "$main_repo_root"/* ]]; then
                # Extract the relative path from the main repo root
                local relative_path="${zoxide_result#$main_repo_root/}"
                
                # Check if this path exists in the current worktree
                if [[ -d "$worktree_root/$relative_path" ]]; then
                    cd "$worktree_root/$relative_path"
                    return 0
                fi
            fi
        fi
    fi
    
    # Fall back to regular zoxide behavior
    __zoxide_z "$@"
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
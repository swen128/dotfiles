#!/usr/bin/env zsh

# Git-aware zoxide wrapper
function z() {
    local WT_ROOT="$HOME/worktrees"

    # Check if we're in a worktree under $WT_ROOT structure
    if [[ "$PWD" =~ ^$WT_ROOT/([^/]+)/([^/]+)/([^/]+)(/.*)?$ ]]; then
        local owner="${match[1]}"
        local repo="${match[2]}"
        local worktree="${match[3]}"
        local current_subpath="${match[4]}"
        local worktree_root="$WT_ROOT/$owner/$repo/$worktree"

        # Query zoxide for the target
        local zoxide_result="$(zoxide query -- "$@" 2>/dev/null)"

        if [[ -n "$zoxide_result" ]]; then
            # Check if target is in the same repo's worktree structure
            if [[ "$zoxide_result" =~ ^$WT_ROOT/$owner/$repo/([^/]+)(/.*)?$ ]]; then
                local target_worktree="${match[1]}"
                local target_subpath="${match[2]}"

                # Map to current worktree
                if [[ -z "$target_subpath" ]]; then
                    cd "$worktree_root"
                elif [[ -d "$worktree_root$target_subpath" ]]; then
                    cd "$worktree_root$target_subpath"
                else
                    cd "$worktree_root"
                fi
                return 0
            fi

            # Check if target is in the main repo (non-worktree location)
            # Get the main repo path from git config
            local main_repo_path
            if [[ -f "$worktree_root/.git" ]]; then
                local gitdir_line="$(head -n1 "$worktree_root/.git" 2>/dev/null)"
                if [[ "$gitdir_line" =~ ^gitdir:\ (.+)/\.git/worktrees/.+$ ]]; then
                    main_repo_path="${match[1]}"

                    if [[ "$zoxide_result" == "$main_repo_path"/* ]] || [[ "$zoxide_result" == "$main_repo_path" ]]; then
                        # Extract relative path and map to current worktree
                        local relative_path="${zoxide_result#$main_repo_path}"
                        relative_path="${relative_path#/}"

                        if [[ -z "$relative_path" ]]; then
                            cd "$worktree_root"
                        elif [[ -d "$worktree_root/$relative_path" ]]; then
                            cd "$worktree_root/$relative_path"
                        else
                            cd "$worktree_root"
                        fi
                        return 0
                    fi
                fi
            fi
        fi
    else
        # Check if we're in the main repo and there's a corresponding worktree structure
        local repo_root
        repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
        if [[ -n "$repo_root" ]]; then
            # Parse GitHub remote URL to get owner and repo name
            local remote_url
            remote_url=$(git config --get remote.origin.url 2>/dev/null)
            if [[ "$remote_url" =~ github.com[:/]([^/]+)/([^/]+)(\.git)?$ ]]; then
                local owner="${match[1]}"
                local repo="${match[2]%.git}"
                local wt_base="$WT_ROOT/$owner/$repo"

                # Query zoxide for the target
                local zoxide_result="$(zoxide query -- "$@" 2>/dev/null)"

                if [[ -n "$zoxide_result" ]]; then
                    # Check if target is in a worktree of this repo
                    if [[ "$zoxide_result" =~ ^$wt_base/([^/]+)(/.*)?$ ]]; then
                        local target_worktree="${match[1]}"
                        local target_subpath="${match[2]}"

                        # Map to main repo
                        local relative_path="${zoxide_result#$wt_base/$target_worktree}"
                        relative_path="${relative_path#/}"

                        if [[ -z "$relative_path" ]]; then
                            cd "$repo_root"
                        elif [[ -d "$repo_root/$relative_path" ]]; then
                            cd "$repo_root/$relative_path"
                        else
                            cd "$repo_root"
                        fi
                        return 0
                    fi
                fi
            fi
        fi
    fi

    # Fall back to regular zoxide behavior
    __zoxide_z "$@"
}

# Git-aware zoxide interactive wrapper
function zi() {
    local WT_ROOT="$HOME/worktrees"

    # Check if we're in a worktree under $WT_ROOT structure
    if [[ "$PWD" =~ ^$WT_ROOT/([^/]+)/([^/]+)/([^/]+)(/.*)?$ ]]; then
        local owner="${match[1]}"
        local repo="${match[2]}"
        local worktree="${match[3]}"
        local current_subpath="${match[4]}"
        local worktree_root="$WT_ROOT/$owner/$repo/$worktree"

        # Call zoxide interactive and capture the result
        local zoxide_result
        zoxide_result="$(zoxide query -i -- "$@" 2>/dev/null)"
        local exit_code=$?

        # If user cancelled the interactive selection, exit
        if [[ $exit_code -ne 0 ]] || [[ -z "$zoxide_result" ]]; then
            return $exit_code
        fi

        # Check if target is in the same repo's worktree structure
        if [[ "$zoxide_result" =~ ^$WT_ROOT/$owner/$repo/([^/]+)(/.*)?$ ]]; then
            local target_worktree="${match[1]}"
            local target_subpath="${match[2]}"

            # Map to current worktree
            if [[ -z "$target_subpath" ]]; then
                cd "$worktree_root"
            elif [[ -d "$worktree_root$target_subpath" ]]; then
                cd "$worktree_root$target_subpath"
            else
                cd "$worktree_root"
            fi
            return 0
        fi

        # Check if target is in the main repo (non-worktree location)
        # Get the main repo path from git config
        local main_repo_path
        if [[ -f "$worktree_root/.git" ]]; then
            local gitdir_line="$(head -n1 "$worktree_root/.git" 2>/dev/null)"
            if [[ "$gitdir_line" =~ ^gitdir:\ (.+)/\.git/worktrees/.+$ ]]; then
                main_repo_path="${match[1]}"

                if [[ "$zoxide_result" == "$main_repo_path"/* ]] || [[ "$zoxide_result" == "$main_repo_path" ]]; then
                    # Extract relative path and map to current worktree
                    local relative_path="${zoxide_result#$main_repo_path}"
                    relative_path="${relative_path#/}"

                    if [[ -z "$relative_path" ]]; then
                        cd "$worktree_root"
                    elif [[ -d "$worktree_root/$relative_path" ]]; then
                        cd "$worktree_root/$relative_path"
                    else
                        cd "$worktree_root"
                    fi
                    return 0
                fi
            fi
        fi

        # If not in same repo structure, just cd to the selected path
        cd "$zoxide_result"
        return 0
    else
        # Check if we're in the main repo and there's a corresponding worktree structure
        local repo_root
        repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
        if [[ -n "$repo_root" ]]; then
            # Parse GitHub remote URL to get owner and repo name
            local remote_url
            remote_url=$(git config --get remote.origin.url 2>/dev/null)
            if [[ "$remote_url" =~ github.com[:/]([^/]+)/([^/]+)(\.git)?$ ]]; then
                local owner="${match[1]}"
                local repo="${match[2]%.git}"
                local wt_base="$WT_ROOT/$owner/$repo"

                # Call zoxide interactive and capture the result
                local zoxide_result
                zoxide_result="$(zoxide query -i -- "$@" 2>/dev/null)"
                local exit_code=$?

                # If user cancelled the interactive selection, exit
                if [[ $exit_code -ne 0 ]] || [[ -z "$zoxide_result" ]]; then
                    return $exit_code
                fi

                # Check if target is in a worktree of this repo
                if [[ "$zoxide_result" =~ ^$wt_base/([^/]+)(/.*)?$ ]]; then
                    local target_worktree="${match[1]}"
                    local target_subpath="${match[2]}"

                    # Map to main repo
                    local relative_path="${zoxide_result#$wt_base/$target_worktree}"
                    relative_path="${relative_path#/}"

                    if [[ -z "$relative_path" ]]; then
                        cd "$repo_root"
                    elif [[ -d "$repo_root/$relative_path" ]]; then
                        cd "$repo_root/$relative_path"
                    else
                        cd "$repo_root"
                    fi
                    return 0
                fi

                # If not in worktree structure, just cd to the selected path
                cd "$zoxide_result"
                return 0
            fi
        fi
    fi

    # Fall back to regular zoxide interactive behavior
    __zoxide_zi "$@"
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
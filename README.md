# Dotfiles Repository

This repository is managed by [chezmoi](https://www.chezmoi.io/) and contains configuration files for development tools and shell environments on macOS.

## Getting Started

### 1. Install chezmoi

```
brew install chezmoi
```

### 2. Clone dotfiles

```
chezmoi init https://github.com/swen128/dotfiles.git
```

### 3. Apply dotfiles

```
chezmoi apply
```

### 4. Install Homebrew packages

```
cd ~
brew bundle install
```

## Overview

### Key Features

- **Shell Configuration**: Zsh with Oh My Zsh and custom plugins
- **Terminal Emulator**: Ghostty with minimalist configuration
- **Editor**: Neovim with LazyVim distribution and custom plugins
- **Version Management**: mise for managing tool versions
- **Git Workflow**: Extensive git aliases and git-delta for improved diffs
- **Terminal Multiplexer**: tmux with custom keybindings and plugins
- **Package Management**: Homebrew with Brewfile for consistent tool installation

## Shell Environment (Zsh)

### Configuration Files
- `.zshrc`: Main shell configuration
- `.zshenv`: Environment variables
- `.zprofile`: Profile settings

### Key Features
- **Oh My Zsh** with plugins:
  - `fzf`: Fuzzy finder integration
  - `fzf-tab`: Tab completion with fzf
  - `gcloud`: Google Cloud SDK integration
  - `vi-mode`: Vi keybindings in the shell
- **Oh My Posh** for a customizable prompt theme
- **Zoxide** for smart directory navigation
- **Custom Functions**:
  - `worktree.zsh`: Git worktree management
  - `gcloud.zsh`: Automatic GCloud account switching based on directory

### Aliases
- `c`: Copy to clipboard (pbcopy)
- `lg`: Launch lazygit
- `ls`: Enhanced ls using eza
- `sb`: Capture tmux pane output
- `ta`: Attach to tmux session

## Development Tools

### Git Configuration
Extensive git configuration with 50+ custom aliases:
- **Workflow aliases**: `pnb` (push new branch), `cane` (commit amend no edit)
- **History exploration**: `day` (today's commits), `recent` (recently touched branches)
- **Maintenance**: `cleanup`, `forget` (clean up remote branches)
- **Enhanced features**:
  - git-delta for beautiful diffs
  - git-secrets for preventing credential leaks
  - git-lfs for large file support

### Neovim
LazyVim-based configuration with:
- **Plugins**:
  - Blink for completion
  - Catppuccin theme
  - Diffview for git integration
  - FZF for fuzzy finding
  - Mini-surround for text manipulation
  - nvim-lint for linting
- **VSCode integration**: Special configuration when running in VSCode

### Homebrew Packages
Comprehensive Brewfile including:
- **CLI Tools**: ripgrep, fzf, fd, bat, eza, tree
- **Development**: neovim, git-delta, gh (GitHub CLI), lazygit
- **Languages**: Python, Ruby (via rbenv)
- **Database**: PostgreSQL, pgcli
- **Security**: git-secrets, 1password-cli
- **Fonts**: Fira Code Nerd Font

## Terminal Configuration

### Ghostty
Minimal configuration with:
- Hidden macOS titlebar
- Quick terminal support (Cmd+F12 toggle)
- Disabled font ligatures

### tmux
Extensive configuration with:
- **Custom prefix**: Ctrl-q (instead of Ctrl-b)
- **Vi-style navigation**: hjkl for pane movement
- **Plugins**:
  - Catppuccin theme
  - tmux-resurrect/continuum for session persistence
  - tmux-open for opening URLs/files
  - tmux-fingers for copying text
- **Custom bindings**:
  - `prefix + g`: Open lazygit in popup
  - `prefix + w`: Edit scrollback in popup
  - Split windows with `s` (horizontal) and `v` (vertical)

## Claude Code Integration

### Custom Commands
Located in `.claude/commands/`:
- `/spec`: Generate specifications
- `/review`: Code review
- `/search`: Enhanced search
- `/requirements-*`: Requirements management
- `/hook-project`: Project-specific hooks

### Hooks
Various hooks for Claude Code workflow:
- **pre-tool-use**: Pre-execution checks
- **post-tool-use**: Post-execution actions
- **notification**: System notifications
- **stop**: Cleanup actions
- **typescript_checker**: TypeScript validation

### Settings
- Model: Opus
- Permissions: Controlled access to git and gcloud commands
- Cleanup period: 1095 days
- MCP integration configured

## Other Configurations

### Karabiner-Elements
Custom keyboard modifications for improved workflow

### ripgrep
Configuration for the ripgrep search tool

### Yazi
File manager with custom keybindings

### PostgreSQL
- `.psqlrc`: PostgreSQL client configuration
- pgcli configuration for enhanced PostgreSQL experience

### IDE Integration
- `.ideavimrc`: IdeaVim configuration for JetBrains IDEs

## Template Variables

This repository uses chezmoi templates with the following variables:
- `{{ .email }}`: User email
- `{{ .name }}`: User name

These are populated from chezmoi's data and used in configurations like git

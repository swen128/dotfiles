# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a dotfiles repository managed by chezmoi, containing configuration files for various development tools and shell environments.

## Git Commit Conventions

Use the Conventional Commits specification.

## Common Commands

### Dotfiles Management
- Apply dotfiles to the system: `chezmoi apply`
- Update dotfiles from the repository: `chezmoi update`
- Edit a dotfile and apply changes: `chezmoi edit <file>` followed by `chezmoi apply`
- See what changes would be applied: `chezmoi diff`

### Homebrew Package Management
- Install all packages defined in Brewfile: `cd ~ && brew bundle install`
- Check for issues with Brewfile: `brew bundle check`

## Architecture and Structure

### Chezmoi Template System
- Files with `.tmpl` extension use Go template syntax
- Template variables like `{{ .email }}` and `{{ .name }}` are populated from chezmoi data
- The `home/` directory contains all dotfiles that will be installed to the user's home directory
- Files prefixed with `dot_` become `.` files (e.g., `dot_zshrc` → `.zshrc`)
- Directories prefixed with `private_` have restricted permissions

### Key Configuration Areas
- **Shell**: Zsh with Oh My Zsh, configured in `home/dot_zshrc`
- **Editor**: Neovim configuration in `home/dot_config/nvim/`
- **Git**: Extensive git aliases and configuration in `home/dot_config/git/config.tmpl`
- **Terminal**: Ghostty terminal emulator configuration
- **Package Management**: Homebrew packages defined in `home/Brewfile`

### Development Tools Configured
- Version managers: mise, rbenv
- Terminal utilities: fzf, ripgrep, bat, eza, lazygit
- Development: Neovim, git-delta, gh (GitHub CLI)
- Database: PostgreSQL, pgcli
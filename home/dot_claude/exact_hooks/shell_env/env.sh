eval "$(/opt/homebrew/bin/mise hook-env -s zsh 2>/dev/null)"

grep() { echo "Use rg (ripgrep) instead of grep for faster searching." >&2; return 2; }
find() { echo "Use fd instead of find for faster searching." >&2; return 2; }


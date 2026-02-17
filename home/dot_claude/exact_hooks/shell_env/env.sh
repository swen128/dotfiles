eval "$(/opt/homebrew/bin/mise hook-env -s zsh 2>/dev/null)"

find() { echo "Use fd instead of find for faster searching." >&2; return 2; }


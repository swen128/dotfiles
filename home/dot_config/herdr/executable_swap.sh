#!/usr/bin/env bash
set -euo pipefail

case "${1:-next}" in
  next) dirs="right down" ;;
  prev) dirs="left up" ;;
  *) echo "usage: $(basename "$0") next|prev" >&2; exit 2 ;;
esac

if [ -n "${HERDR_ACTIVE_PANE_ID:-}" ]; then
  ref=(--pane "$HERDR_ACTIVE_PANE_ID")
else
  ref=(--current)
fi

for d in $dirs; do
  changed=$(herdr pane swap --direction "$d" "${ref[@]}" | jq -r '.result.swap.changed')
  [ "$changed" = "true" ] && exit 0
done
exit 0

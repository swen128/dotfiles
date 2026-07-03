#!/usr/bin/env bash
set -euo pipefail

dir="${1:-right}"
case "$dir" in
  right) shrink="left" ;;
  down)  shrink="up" ;;
  *) echo "usage: $(basename "$0") right|down" >&2; exit 2 ;;
esac

if [ -n "${HERDR_ACTIVE_PANE_ID:-}" ]; then
  ref=(--pane "$HERDR_ACTIVE_PANE_ID")
else
  ref=(--current)
fi

layout=$(herdr pane layout "${ref[@]}")

count=$(jq '.result.layout.panes | length' <<<"$layout")
[ "$count" -lt 2 ] && exit 0

tab=$(jq -r '.result.layout.tab_id' <<<"$layout")
focused=$(jq -r '.result.layout.focused_pane_id' <<<"$layout")

# tmux even-horizontal/vertical restructures the tab into a single
# row/column. herdr rejects same-tab pane.move ("reason":"same_tab"),
# so each pane hops through a temporary tab, which auto-closes when
# emptied. The pane's PTY and scrollback survive the round trip.
aligned=$(jq --arg dir "$dir" '
  .result.layout as $l |
  (if $dir == "right" then "height" else "width" end) as $len |
  [$l.panes[] | .rect[$len] >= $l.area[$len] - 1] | all
' <<<"$layout")

if [ "$aligned" != "true" ]; then
  order=$(jq -r --arg dir "$dir" '
    .result.layout.panes
    | (if $dir == "right"
       then sort_by([.rect.x, .rect.y])
       else sort_by([.rect.y, .rect.x])
       end)
    | .[].pane_id
  ' <<<"$layout")
  prev=""
  for p in $order; do
    if [ -z "$prev" ]; then prev="$p"; continue; fi
    focus="--no-focus"
    [ "$p" = "$focused" ] && focus="--focus"
    herdr pane move "$p" --new-tab --label _balance_tmp --no-focus >/dev/null
    herdr pane move "$p" --tab "$tab" --split "$dir" --target-pane "$prev" "$focus" >/dev/null
    prev="$p"
  done
  layout=$(herdr pane layout "${ref[@]}")
fi

# For each split along the axis, the target ratio is (columns left of the
# boundary / total columns), counting distinct pane origins as columns so a
# stacked group counts once. The resize amount is exactly the ratio delta,
# but negative amounts are silently ignored ("changed":false), so a shrink
# must instead grow the pane on the far side of the boundary in the
# opposite direction.
jq -r --arg dir "$dir" '
  .result.layout as $l |
  ($l.panes) as $panes |
  (if $dir == "right"
   then {pos: "x", len: "width"}
   else {pos: "y", len: "height"}
   end) as $ax |
  [$l.splits[] | select(.direction == $dir)] | .[] as $s |
  ($s.rect[$ax.pos] + $s.rect[$ax.len] * $s.ratio) as $boundary |
  [$panes[] | select(
      .rect.x >= $s.rect.x - 1 and .rect.y >= $s.rect.y - 1 and
      .rect.x + .rect.width  <= $s.rect.x + $s.rect.width  + 1 and
      .rect.y + .rect.height <= $s.rect.y + $s.rect.height + 1
   )] as $region |
  [$region[] | select(.rect[$ax.pos] + .rect[$ax.len] <= $boundary + 1)] as $left |
  ([$region[].rect[$ax.pos]] | unique | length) as $total_units |
  ([$left[].rect[$ax.pos]] | unique | length) as $left_units |
  (($left_units / $total_units) - $s.ratio) as $delta |
  select(($delta | fabs) > 0.005) |
  (if $delta > 0
   then [$left[] | select(.rect[$ax.pos] + .rect[$ax.len] >= $boundary - 3)]
   else [$region[] | select(.rect[$ax.pos] >= $boundary - 1 and .rect[$ax.pos] <= $boundary + 3)]
   end | first) as $edge |
  select($edge != null) |
  "\($edge.pane_id) \(if $delta > 0 then "grow" else "shrink" end) \($delta | fabs)"
' <<<"$layout" |
while read -r pane kind amount; do
  if [ "$kind" = "grow" ]; then
    herdr pane resize --pane "$pane" --direction "$dir" --amount "$amount" >/dev/null
  else
    herdr pane resize --pane "$pane" --direction "$shrink" --amount "$amount" >/dev/null
  fi
done

# Charts & Data Viz

Read this when a design needs to **plot real data** — bars, lines, donuts, sparklines, tables.

## Fastest path: the `charts.js` starter (use this for dashboards)

Copy the starter into your project and reference it, exactly like `deck-stage.js`:

```
cp ~/.claude/skills/claude-design/starters/charts.js <project>/charts.js
```

Add `<script src="charts.js"></script>` inside `<x-dc>` (before `</x-dc>`), then drop in chart
elements — each renders **real marks from your `data` JSON**, and falls back to sample data if you
forget (so a chart is *never* blank):

```html
<cd-bar-chart  accent="#c8643f" style="width:100%;height:220px;display:block"
  data='[{"label":"Mon","value":40},{"label":"Tue","value":62},{"label":"Wed","value":48}]'></cd-bar-chart>
<cd-line-chart accent="#1a8a4a" area="true" style="width:100%;height:220px;display:block"
  data='[8,14,11,22,19,28,34,41,47]'></cd-line-chart>
<cd-donut-chart center="64%" style="width:100%;height:220px;display:block"
  data='[{"label":"Card","value":64,"color":"#c8643f"},{"label":"Cash","value":36,"color":"#1a1814"}]'></cd-donut-chart>
<cd-sparkline  accent="#c8643f" style="width:100%;height:60px;display:block" data='[4,6,5,9,7,12,10,15]'></cd-sparkline>
```

Always pass your own `data` (the design's real numbers) and set an explicit pixel `height`. Tags:
`cd-bar-chart`, `cd-line-chart` (`area="true"` for filled), `cd-donut-chart` (or `value="68"` for a
single progress ring), `cd-sparkline`. **A labeled chart panel must contain one of these (or a
hand-built chart below) with visible marks — never ship axes/legend with no data.**

## Hand-building charts (when you want full control)

Our runtime also lets you build charts by hand with inline-styled divs and inline `<svg>` — that's
fine, and hand-built charts look better than library defaults when you control every pixel.

## The one rule: every chart must render real marks

The dominant failure is **empty charts** — axes, gridlines, and labels with no bars, no line, no
slice. An empty chart is worse than no chart. Before you ship any chart, confirm the data-bearing
element is present and non-empty:

- Bar chart → the bar divs exist and have non-zero heights.
- Line/area → the `<polyline>`/`<path>` has a real `points`/`d` string computed from your data.
- Donut/progress → the arc `<circle>` has a `stroke-dasharray` that's a fraction of its circumference.

**Compute coordinates from a data array.** Never hand-wave `points="..."` — derive every point so it
can't come out empty. Show the math inline (see examples). In a deck, charts live inside a `<section>`
slide at the fixed canvas; the deck-stage auto-fits overflow, but still size charts to fit the slide.

## Bar chart — flex divs with heights

Map each value to a height via `value / max * 100%`. The track is a fixed-height flex row.

```html
<div style="display:flex; align-items:flex-end; gap:12px; height:180px;">
  <!-- data: [40, 72, 55, 90, 63]; max = 90 -->
  <div style="flex:1; height:44%;  background:#3b82f6; border-radius:6px 6px 0 0;"></div>
  <div style="flex:1; height:80%;  background:#3b82f6; border-radius:6px 6px 0 0;"></div>
  <div style="flex:1; height:61%;  background:#3b82f6; border-radius:6px 6px 0 0;"></div>
  <div style="flex:1; height:100%; background:#2563eb; border-radius:6px 6px 0 0;"></div>
  <div style="flex:1; height:70%;  background:#3b82f6; border-radius:6px 6px 0 0;"></div>
</div>
```

Heights are `40/90, 72/90, 55/90, 90/90, 63/90`. Highlight the peak with a darker shade. Add labels
in a second flex row with matching `flex:1` cells.

## Line / area chart — inline SVG with computed polyline

Use a `viewBox` so coordinates are simple. Map data to points:
`x = i / (n-1) * width`, `y = height - (value - min) / (max - min) * height`.

```html
<!-- data: [12, 30, 22, 48, 40, 65]; n=6, min=12, max=65; viewBox 0..300 x 0..100 -->
<svg viewBox="0 0 300 100" preserveAspectRatio="none"
     style="width:100%; height:160px;">
  <!-- area fill under the line (line points + close down the bottom edge) -->
  <path d="M0,100 L0,100 L60,66.0 L120,81.1 L180,32.1 L240,47.2 L300,0 L300,100 Z"
        fill="#3b82f6" fill-opacity="0.12" />
  <!-- the line itself -->
  <polyline points="0,100 60,66.0 120,81.1 180,32.1 240,47.2 300,0"
            fill="none" stroke="#2563eb" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round"
            vector-effect="non-scaling-stroke" />
</svg>
```

Each `y` above is `100 - (v-12)/(65-12)*100`: e.g. v=30 → `100-18/53*100 = 66.0`, v=65 → `0`. Use
`preserveAspectRatio="none"` to stretch and `vector-effect="non-scaling-stroke"` so the stroke stays
crisp. For a pure line, drop the `<path>`. Dots: add a `<circle>` per point at the same coordinates.

## Donut / progress ring — SVG stroke-dasharray

A circle's circumference is `2πr`. To show `p` percent, set `stroke-dasharray: filled gap` where
`filled = p/100 * C`. Rotate -90° so it starts at top.

```html
<!-- r=42 → C = 2*π*42 ≈ 263.9; show 68% → filled = 0.68*263.9 ≈ 179.5 -->
<svg viewBox="0 0 100 100" style="width:140px; height:140px;">
  <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" stroke-width="12" />
  <circle cx="50" cy="50" r="42" fill="none" stroke="#2563eb" stroke-width="12"
          stroke-linecap="round" stroke-dasharray="179.5 263.9"
          transform="rotate(-90 50 50)" />
  <text x="50" y="55" text-anchor="middle" font-size="20" font-weight="700"
        fill="#111827">68%</text>
</svg>
```

Same trick draws a multi-segment donut: stack circles, each with its own dasharray, offsetting the
next with `stroke-dashoffset` by the running total of prior arcs (negative to advance clockwise).

## Sparkline — tiny inline SVG, no axes

A line chart stripped to just the mark. Same coordinate math, sits inline next to a number.

```html
<span style="display:inline-flex; align-items:center; gap:8px;">
  <strong style="font-size:20px;">¥1.28M</strong>
  <!-- data: [4,6,5,8,7,9,12]; min=4 max=12 over viewBox 0..70 x 0..20 -->
  <svg viewBox="0 0 70 20" style="width:70px; height:20px;">
    <polyline points="0,20 11.7,15 23.3,17.5 35,10 46.7,12.5 58.3,7.5 70,0"
              fill="none" stroke="#16a34a" stroke-width="1.5"
              vector-effect="non-scaling-stroke" />
  </svg>
</span>
```

`y = 20 - (v-4)/(12-4)*20`; `x = i/6*70`.

## Data table — clean, dependency-free

When precision matters more than shape, a table beats a chart. Right-align numbers, use a hairline
rule, and avoid heavy borders.

```html
<table style="width:100%; border-collapse:collapse; font-size:14px;">
  <thead>
    <tr style="text-align:left; color:#6b7280; border-bottom:1px solid #e5e7eb;">
      <th style="padding:8px 0;">Region</th>
      <th style="padding:8px 0; text-align:right;">Revenue</th>
      <th style="padding:8px 0; text-align:right;">YoY</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:8px 0;">Tokyo</td>
      <td style="padding:8px 0; text-align:right; font-variant-numeric:tabular-nums;">¥842K</td>
      <td style="padding:8px 0; text-align:right; color:#16a34a;">+12%</td>
    </tr>
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:8px 0;">Osaka</td>
      <td style="padding:8px 0; text-align:right; font-variant-numeric:tabular-nums;">¥438K</td>
      <td style="padding:8px 0; text-align:right; color:#dc2626;">−4%</td>
    </tr>
  </tbody>
</table>
```

Use `font-variant-numeric:tabular-nums` so digits align. Color deltas (green up, red down) but keep
the rest restrained.

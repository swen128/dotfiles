# Wireframe

Wireframing is for *exploring*, fast. You're not committing to a look — you're putting many ideas on
the table so the user can react and point. Lo-fi on purpose: grayscale, boxed, no color, no real
type system, no polish. The value is breadth and speed, not fidelity. Skip the questions round and
just generate; the user will steer once they see options.

Lay every idea out as **labeled frames side-by-side in a single Design Component**. Plain markup, not
a canvas or artboard widget — so every frame stays directly editable and commentable in the preview.

## The canvas layout

Many frames in a row (or a few rows). The page itself scrolls — never put `overflow:auto` on an inner
wrapper, never build pan/zoom. The outer wrapper carries the gray and grows with the content:

```html
<div style="width:max-content; min-width:100%; min-height:100vh; box-sizing:border-box;
            padding:48px; background:#e7e5df; font-family: ui-monospace, monospace">
  <div style="display:flex; gap:48px; align-items:flex-start">
    <!-- frame -->
    <div style="flex:none; width:360px" data-screen-label="Home — list view">
      <div style="font-size:13px; color:#6b6b6b; margin-bottom:10px">Home — list view</div>
      <div style="background:#fff; border-radius:2px; box-shadow:0 1px 3px rgba(0,0,0,.08);
                  height:720px; padding:20px; box-sizing:border-box">
        …wireframe contents…
      </div>
    </div>
    <!-- next frame -->
  </div>
</div>
```

- Each row is `display:flex; gap:48px; align-items:flex-start` — start-aligned, **never** centered.
  `justify-content:center` / `place-items:center` / `margin:auto` on an overflowing row pushes frames
  off the left edge where the scrollbar can't reach them.
- Each frame is `flex:none` + a fixed pixel width, a small gray label above, a white card below.
- Multiple themes? Stack rows: one `display:flex` row per theme, each with its own label.

## The lo-fi vocabulary

Commit to a deliberately unfinished look so nobody mistakes spacing for a final decision. **Lo-fi
means lo-fi:** greyscale, boxes, structural placeholders, system/mono font. Do NOT drift into a
full hi-fi colored UI mid-wireframe — that defeats the purpose and confuses what's being decided.
Keep fidelity **consistent across every frame in the set**: don't mix a polished colored frame next
to a grey skeleton, or the user reads the polish as a verdict.

- **Grayscale only.** Backgrounds `#fff` / `#f4f4f2`, lines `#d4d4d2`, text `#3a3a3a` / `#9a9a9a`. No
  brand color, no accent — one mid-gray for "primary" emphasis at most.
- **Readable at full-frame.** Keep labels and type legible at the frame's natural size — no tiny text.
  Field labels, nav items, and headers should read clearly (≥12px); greeked bars stand in for body
  copy, never for the structural labels that explain intent.
- **Boxes for everything.** Images/avatars are gray rectangles, often with a single diagonal line or
  an "image" label. Don't draw real imagery or SVG icons — a `[icon]` box or a simple unicode glyph
  in a box reads fine.
- **Greeked text** is fine for body runs (gray bars of varying width); use **real labels** for
  anything structural — nav items, buttons, section headers, field labels — so the layout's intent is
  legible. A monospace UI font (`ui-monospace`) reinforces "this is a sketch."
- **Visible structure:** 1px borders, dashed placeholders, explicit gaps. Use `flex`/`grid` with
  `gap` for rows of elements so the skeleton stays clean.

## What to vary across frames

Pick an axis and show real alternatives — that's the whole point:

- **Layout structure:** sidebar vs top-nav; list vs grid vs board; single-column vs split-pane.
- **Information hierarchy:** what's primary on the screen, what's secondary, what's hidden behind a
  tap. Different frames make different things the hero.
- **Flow:** the steps of a task as a row of frames (step 1 → step 2 → step 3), or two competing flows
  stacked as two rows.
- **Density:** a roomy version next to a compact version.

Label each frame with what it's exploring (`data-screen-label` + the visible caption), so when the
user comments "this one" the event tells you which frame they mean.

## Speed over everything

- One DC, many frames. No logic class needed for a static wireframe — these are template-only.
- Don't wire interactions; a wireframe is static. (If they want it clickable, that's an Interactive
  Prototype — see `interactive-prototype.md`.)
- Inline styles only, repeated per frame — no shared classes (see `design-components.md`).
- Don't agonize. Generate 4–8 frames, let the user point, then go deeper on the winner — promoting it
  to a hi-fi direction with `frontend-design.md`.

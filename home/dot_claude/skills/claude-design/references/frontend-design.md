# Frontend Design

Read this when you're designing something with **no brand and no design system to inherit** — a fresh
app, a landing page, a tool with no existing look. Without a brand to follow, the failure mode is
defaulting to the generic AI-slop aesthetic. The fix is to *commit to a direction*: a real point of
view on type, color, and layout, applied consistently. Pick something with a spine and execute it
fully. Decide your system out loud before you build, then hold to it.

## Commit to an aesthetic direction

Don't blend three styles into mush. Pick one and lean in — e.g. *editorial & typographic* (big serif
headlines, generous whitespace, restrained color), *technical & utilitarian* (mono labels, tight
grid, hairline rules, data-dense), *warm & humanist* (soft neutrals, rounded but not bubbly, a single
warm accent), *brutalist & confident* (heavy weights, hard edges, high contrast). State which one
you're committing to in a sentence before you start, then make every decision serve it.

## Type

Type carries more of the aesthetic than anything else — spend your attention here.

- **Pair two families with contrast and intent:** a display/heading face + a clean text face (or one
  great family used across a real weight range). Contrast in classification (serif heading / sans
  text), not just two similar sans-serifs.
- **Avoid the overused defaults:** Inter, Roboto, Arial, and Fraunces read as "AI made this." Reach
  for fonts with character — well-made serifs, grotesques, or humanist sans with personality. Load
  them in `<helmet>` via `@font-face` or a font `<link>` (the only legal helmet style content
  alongside `@keyframes` and resets).
- **Build a real type scale** and use it: a small set of sizes with deliberate jumps, not a dozen
  near-identical sizes. Set `line-height` tighter on large display text, looser on body. Use
  `text-wrap: pretty`/`balance` on headings. Mind weights and tracking — large display text usually
  wants slightly negative letter-spacing.

## Color

Restraint reads as taste. A tight, intentional palette beats a rainbow every time.

- **One accent, a neutral ramp, done.** Most of the surface is neutrals (near-white to near-black);
  color is the exception that draws the eye, not the wallpaper.
- **Define colors in `oklch()`** so the palette is perceptually even — pick a hue, hold it, and vary
  lightness/chroma for the ramp. `oklch` keeps related colors harmonious in a way hex-by-eye doesn't.
  Derive tints/shades of your accent the same way rather than inventing unrelated hex values.
- **Avoid the slop tells:** no gradient-soup backgrounds (especially purple→pink), no glassmorphism by
  default, no rounded-corner card with a left-border accent stripe, no neon-on-dark unless the
  direction genuinely calls for it. Flat, confident color fields and real contrast age better.
- **The cliché to never ship:** a gradient hero on top of a pastel card with a left-border accent
  stripe. It is the single most-generated AI-slop layout. If you catch yourself reaching for it, stop
  and recommit to your stated brand system — your chosen type, your one accent, your spacing scale.

## Layout

- **Pick a layout system and obey it:** a column grid, a baseline rhythm, a consistent spacing scale
  (a small set of step values you reuse — not arbitrary px everywhere). Alignment and consistent
  spacing are most of what makes a layout feel designed.
- **Whitespace is structure,** not waste. Give primary elements room; group with proximity; separate
  with space before reaching for borders or boxes.
- **Use CSS grid and flex with `gap`** for real layout — multi-column grids, split panes, asymmetric
  compositions. `gap`-based spacing also survives the user's direct-manipulation edits in the preview
  cleanly. Reserve inline flow for runs of text.
- **Asymmetry and scale contrast** create interest: a huge headline against small dense text, a wide
  column against a narrow rail. Centered-everything is the safe, forgettable default — break it on
  purpose.

### Fill the canvas, never overflow it

The deck-stage auto-fits an overflowing slide by scaling it down — but a scaled-down slide reads as
small and off, so still compose to the actual canvas. Two opposite failures to avoid:

- **Posters / portrait compositions must fill, with vertical rhythm.** No giant dead zone parked mid-
  canvas. Make the root a full-height column that distributes its blocks — masthead at top, content,
  footer at bottom — so the whole height is used intentionally:
  ```jsx
  <section style={{ height: '100%', display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-between', padding: 64, boxSizing: 'border-box' }}>
    <header>…</header><main>…</main><footer>…</footer>
  </section>
  ```
- **Never exceed the canvas.** Always `boxSizing: 'border-box'` on padded full-size containers; don't
  let a fixed-px block + padding sum past the canvas, and don't let long strings clip. Compose to fit.

### Mastheads and eyebrows

Type rows like `BERLIN / EST. MMXI` wrap unpredictably and break the composition. Keep them on one
line with `whiteSpace: 'nowrap'`, and scale with `clamp()` rather than letting them reflow:
```jsx
<div style={{ whiteSpace: 'nowrap', fontSize: 'clamp(14px, 2vw, 22px)', letterSpacing: '0.2em' }}>
  BERLIN · EST. MMXI
</div>
```

### Single big-stat layouts

When one giant number anchors the slide, give each stat and its label its own **fixed cell** so
nothing collides or reflows: a grid/flex cell with `minWidth` and `overflow: 'hidden'` (or
`textOverflow: 'ellipsis'`). Verify CTA and URL strings actually fit at the final rendered size —
a long URL that fits in your head may overrun the cell; shorten it or shrink its type until it fits.

## Don't

- Don't draw imagery or icons as hand-built SVG — use sized placeholder boxes and ask the user for
  real assets. (A spare set of simple line glyphs is fine; illustration is not.)
- Don't add filler — no dummy sections, stat counters, or logo-cloud rows just to fill height. Every
  element earns its place; less is more. If a section feels empty, solve it with layout, not invented
  content. Ask before adding material the user didn't request.
- Don't use emoji as UI unless the direction explicitly embraces it.

## Execution

Build it as a single Design Component with inline styles (see `design-components.md`). Vocalize your
system first — "Editorial direction: [display serif] for headings, [text sans] for body, near-black
on warm off-white, one terracotta accent in oklch, 12-column grid, generous top-of-section
whitespace" — then apply it uniformly. Consistency *is* the design: the same accent, the same
spacing steps, the same type roles everywhere. A modest direction executed with discipline beats an
ambitious one applied unevenly.

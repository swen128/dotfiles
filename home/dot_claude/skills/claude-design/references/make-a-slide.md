# Make a slide deck

Build a presentation deck as a single self-contained Claude Design artifact (`.dc.html`) that
mounts the `deck-stage` web component. The runtime serves it, live-reloads it, and routes
direct text/style edits and comments back to you. This guide adapts the real "Make a deck" craft
to OUR runtime + starter path — read it alongside `design-components.md` for the DC skeleton.

## Role and mindset

You are a presentation designer building slides for a speaker to present. HTML is the medium, but
your thinking is a consultant's: clarity, narrative flow, and back-of-the-room readability. You are
NOT building a website. Every slide is both layout design and copywriting.

Before building, write an outline — a good outline is storytelling. If the user did not tell you the
duration (in minutes), the audience, or the desired aesthetic/brand, ASK before designing. Do not
default to a generic look.

## Setup: copy the starter, mount the component

1. Copy the deck-stage starter into your project dir (it is vanilla JS, offline, no deps):
   ```
   cp ~/.claude/skills/claude-design/starters/deck_stage.js \
      ~/.claude-design/projects/<id>/deck-stage.js
   ```
   Reference it from the artifact as the relative path `./deck-stage.js` (the server serves project
   files at `/serve/<id>/...`, so the relative URL resolves).

2. Author the deck as a `.dc.html` artifact (e.g. `Deck.dc.html`). Mount `deck-stage` via `x-import`
   with `component-from-global-scope` so support.js loads the self-registering custom element:
   ```html
   <!doctype html><html><head><meta charset="utf-8"></head><body>
     <x-dc>
       <helmet>
         <style>
           :root {
             --type-title: 64px; --type-subtitle: 44px; --type-body: 34px; --type-small: 28px;
             --pad-top: 100px; --pad-bottom: 80px; --pad-x: 100px;
             --gap-title: 52px; --gap-item: 28px;
           }
           /* deck-wide system rules go here */
         </style>
       </helmet>
       <x-import component-from-global-scope="deck-stage" from="./deck-stage.js"
                 width="1920" height="1080" hint-size="100%,100%">
         <section data-label="Cover" data-speaker-notes="Open with the thesis.">
           <h1>…</h1>
         </section>
         <section data-label="…">…</section>
       </x-import>
     </x-dc>
     <script src="support.js"></script>
   </body></html>
   ```
   The component handles letterboxed `contain` scaling of the active slide, arrow-key / click nav,
   the slide counter + label overlay, and reads its slide list from its light-DOM `<section>`
   children. Do NOT hand-roll stage/scaling/nav. deck-stage also AUTO-FITS an overflowing slide by
  scaling it down — but that's a safety net, not a license: a good deck fits the canvas natively, so
  compose to the 1920×1080 (minus padding) content area and treat any triggered auto-shrink as a bug
  to fix, not the intended look.

## Slide content is STATIC HTML — this is load-bearing

Write slide bodies as literal static markup inside each `<section>`. The runtime's preview-agent
lets the user click any heading or paragraph in edit-text mode and retype it in place — the server
splices the change straight into your source file. The moment a slide's content is produced by a
loop, a JS array, or a framework component, that direct-edit path is lost and every tweak has to
round-trip through a chat message to you. So for anything static markup can express (text, layout,
background, image), write the literal element and style it with CSS. Reach for scripted rendering
only when a slide genuinely needs behaviour static HTML can't deliver (an interactive chart, a live
demo, real state).

Two rules keep static slides directly editable:
- Each piece of text lives in its own leaf element. Put "Revenue" in its own `<span>` inside the
  `<h2>` rather than mixing text and a child in the same parent.
- Repeated structure is written out, not generated. Three bullet `<li>`s in the markup, not one
  `<li>` rendered three times — the repetition is what lets the user edit bullet two without
  touching bullet one.

## Tagging for the runtime

- `data-label="…"` on every `<section>` — the deck-stage overlay shows it and the preview-agent
  uses it as the nearest-label for comment/edit descriptors, so each event tells you which slide.
- `data-speaker-notes="…"` on a `<section>` carries presenter notes.
- The component absolutely positions every slotted `<section>` for you — do NOT set
  position / inset / width / height on the slide `<section>` elements yourself.

## Type scale, rhythm, and sizing

Commit to a projection-appropriate type scale and spacing as CSS custom properties in the helmet
`<style>` BEFORE writing slides (see skeleton above). Reference them everywhere via `var(…)` —
every font-size uses a `--type-*` variable, every padding/gap a `--pad-*` / `--gap-*` variable.
Keeping these in CSS (not JS) means the user can change one number to re-size the whole deck while
the markup stays static.

- Titles ≥ 48px. A reasonable scale at 1920×1080 is in the skeleton; at 1280×720 scale by ~0.67.
- NEVER use a font size below 24px — that is the hard floor.
- When the user asks for a specific size, assume **points** (PowerPoint/Keynote unit), not pixels:
  `px = pt × 1.333`. So "make titles 36pt" → ~48px.
- The `--pad-bottom` reserves structural breathing room at the base of every slide. Web defaults
  (14–16px body, 48–72px padding) are too small for slides — if values don't feel generous, they
  aren't.
- Keep ~80px clear at the bottom for the centered deck-nav pill: don't place author/footer text in
  the bottom-center, and let `--pad-bottom` (≥80px) keep your content above it so they never collide.

### Stat columns and big numbers — fit, don't overflow

- Cap side-by-side stat columns at **3**. Constrain their COMBINED width to the slide content area
  (`width: 100%` between the `--pad-x` margins) so the rightmost column never spills off-canvas:
  ```html
  <div style="display:flex;gap:60px;width:100%;justify-content:space-between">
    <div style="flex:1;min-width:0"><span style="font-size:120px;line-height:1">42%</span>…</div>
    <div style="flex:1;min-width:0">…</div>
    <div style="flex:1;min-width:0">…</div>
  </div>
  ```
  `flex:1;min-width:0` keeps columns equal and lets them shrink instead of pushing the row wider.
- Size big display numbers to FIT their cell. A 5-digit number can't wear the same px as a 2-digit
  one — drop the font-size (or use `clamp()`) so it stays on one line inside its column, not clipped
  or wrapped.

## Composition and visual variety

- Aim for variety: mix full-image slides, different background colors, large numbers/figures,
  quotes, tables, and some textual slides. Avoid a deck of top-aligned text or mostly-empty slides.
- CRITICAL anti-slop: do NOT put too much text on slides. In your plan, decide which parts of the
  story are best as tables, diagrams, quotes, or numbers rather than prose.
- Parallelism: section-header slides look the same; repeated elements sit in the same position.
- `align-items: flex-start` with open space in the bottom third is correct slide composition, not a
  defect. Resist the web reflex to re-center it — the open space is intentional. But DON'T top-align
  a half-empty slide either: if content fills only the top, either center it vertically or add a
  footer/figure so the slide reads as deliberately balanced, not abandoned.
- No accent-border cards or takeaway boxes.
- Images: view them and decide. Full-bleed images aspect-fill; screenshots/diagrams aspect-fit on a
  contrasting background, rarely overlaid. For text on images, match the brand's protection
  pattern (cards, gradients, blur).
- No emoji or self-drawn assets unless asked. Use brand icons/images.
- Use smooth transitions; clean, professional look; generous whitespace; cohesive palette.

## Titles tell the story

The titles alone should read like a table of contents — a person reading ONLY the titles should
follow the whole presentation. Pick ONE title style and stick with it:
- Short textbook noun-phrases, capitalized (e.g. "Market Research", "Team Structure"), OR
- Action titles as brief declarative phrases (e.g. "Asia is our largest market…").

Avoid Claude-isms that out the deck as AI-generated: titles that "deliver the verdict",
overdramatize, manufacture tension ("It's not X. It's Y."), heavy-handed reframing, faux-suspense,
or punchline-style titles ("The magic moment"). A title INTRODUCES the slide in straightforward
language — it is not the speaker's payoff line.

## Planning steps

1. Ask for audience, brand/aesthetic, and duration if unknown.
2. Write the full title sequence in ONE grammatical style into a `scratchpad.md`. Read them back —
   could someone follow the flow from titles alone? Revise.
3. Define the `--type-*` / `--pad-*` / `--gap-*` scale in the helmet `<style>` before any slide.
4. Build each slide as a deliberate act of design + copywriting; each slide must stand alone.

## Launch and iterate

Write the artifact + `deck-stage.js` into `~/.claude-design/projects/<id>/`, then run
`bun ~/.claude/skills/claude-design/scripts/start.ts <id>` via the Monitor tool. Watch stdout for
`[comment …]`, `[edit-text …]`, and `[edit-style …]` events tagged with the slide label and file,
and edit the source in response — the preview live-reloads on save.

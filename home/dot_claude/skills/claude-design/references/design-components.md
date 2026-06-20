# Design Components (DC) — Authoring Guide

This is the authoritative reference for authoring design artifacts that render under
**our** local DC runtime (`server/support.js`). Every artifact you produce for the
Claude Design skill is a **Design Component ("DC")**: a single `Name.dc.html` file
that opens directly in a browser, paints live from the first streamed character, and
can be imported by other DCs.

Do NOT write `<script type="text/babel">` pages, `.jsx` entrypoints, or plain `.html`
designs. The DC is the entrypoint.

> Important difference from the hosted product: in this local skill there is no
> `dc_write` / `dc_html_str_replace` tool. You write the **whole `.dc.html` file** by
> hand with the `Write` tool (and edit it with `Edit`). So you must emit the full
> document skeleton yourself — exactly as specified below — not just the three inner
> pieces.

## The artifact skeleton our runtime expects

Our `support.js` looks for three things inside a complete HTML document: an `<x-dc>`
template, a `<script type="dc-logic" data-props='…'>` logic block, and the
`<script src="support.js"></script>` include that boots the runtime. Write exactly
this skeleton:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
</head>
<body>
  <x-dc>
    <!-- TEMPLATE: markup with {{ holes }}, <sc-for>, <sc-if>, <dc-import>, <x-import> -->
    <!-- An optional <helmet>…</helmet> goes at the TOP of this template. -->
  </x-dc>

  <script type="dc-logic" data-props='{ "$preview": { "width": 420, "height": 280 } }'>
    class Component extends DCLogic {
      // state, renderVals(), lifecycle — NO render()
    }
  </script>

  <script src="support.js"></script>
</body>
</html>
```

Hard rules — the runtime depends on every one of them:

- The template lives **between `<x-dc>` and `</x-dc>`** and nowhere else. Do not nest
  a second `<!doctype>`/`<html>`/`<x-dc>` inside it.
- The logic block is `<script type="dc-logic">`. Its class **must** be named
  `Component` and **must** `extends DCLogic`. No `render()` method (the runtime
  renders the template). No `import`/`export` — `DCLogic` is injected as a global.
  Omit the whole `<script type="dc-logic">` block for template-only designs; the
  runtime supplies an empty default `Component`.
- `data-props` is JSON on the **logic script tag**, never on `<x-dc>`. It is optional.
- `<script src="support.js"></script>` is **required and must come last** in `<body>`.
  Our server serves `/serve/<id>/support.js` for exactly this relative reference, so
  keep it as the literal `support.js` (not an absolute URL).
- The server also injects `<script src="/preview-agent.js"></script>` before `</body>`
  when serving — you do not write that; just make sure a normal `<body>…</body>`
  exists.

### `data-props` metadata

`$preview: { "width", "height" }` (px numbers or CSS strings) sets the preferred
preview size for **sized fragments** (cards, modals). Omit `$preview` for full pages.

For a DC meant to be embedded by others, add one entry per prop it reads:

```json
{
  "$preview": { "width": 420, "height": 280 },
  "title":  { "editor": "text",  "default": "Untitled", "tsType": "string" },
  "accent": { "editor": "color", "default": "#b8462e",  "tsType": "string" },
  "count":  { "editor": "int",   "default": 3, "min": 0, "max": 20, "tsType": "number" }
}
```

`editor` is one of `text | color | int | float | boolean | enum | null` (`+options`
for enum, `+min/max/step` for numbers; `null` for callbacks/objects). `default` seeds
the editor only — fall back at runtime with `this.props.x ?? …` inside `renderVals()`.
Don't invent props the component doesn't actually read.

## Templates — `{{ dotted holes }}`

The template is HTML with `{{ path }}` holes. **Holes are dotted lookups only** —
`{{ user.name }}`, `{{ $index }}`, or literals (`{{ true }}`, `{{ false }}`, numbers).
They are **never expressions**: `{{ a + b }}`, `{{ !x }}`, `{{ fn() }}` all fail (the
runtime renders nothing and logs a `console.warn`). Compute anything derived in
`renderVals()` and expose it by name.

The runtime resolves a hole against `vals = { ...this.props, ...renderVals() }` —
so `renderVals()` keys override props of the same name.

### Text and attribute interpolation

| Form | Result |
|---|---|
| `<p>Hello {{ name }}</p>` | text node interpolation → string |
| `x="literal"` | the literal string |
| `x="{{ path }}"` | the **raw value** (number, function, ref, object) |
| `x="a {{ p }} b"` | interpolated **string** |
| `onClick="{{ handler }}"` | whole-value handler; JSX camelCase → `addEventListener('click', …)` |
| `class="card"` / `for="id"` | map to `class` / `for` on the real DOM |

Event handlers and refs are whole-value attrs written in JSX camelCase
(`onClick`, `onInput`, `onChange`); the runtime lowercases them to real DOM events.

## Control flow — `<sc-for>` / `<sc-if>` (always set `hint-*`)

These render placeholders while their bound values are still `undefined` mid-stream,
so they **must** carry a `hint-*` attribute. Without it the block shows nothing until
the value resolves — which kills live painting.

```html
<sc-for list="{{ items }}" as="item" hint-placeholder-count="3">
  <div style="padding:12px 16px; border-bottom:1px solid #eee;">
    {{ $index }}. {{ item.name }}            <!-- both `item` and `$index` are in scope -->
  </div>
</sc-for>

<sc-if value="{{ hasItems }}" hint-placeholder-val="{{ true }}">
  <p>You have items.</p>
</sc-if>
```

- `<sc-for>`: repeats its children once per element of `list`, binding `as` (e.g.
  `item`) and `$index` in scope. While `list` is `undefined`, the runtime renders
  `hint-placeholder-count` placeholder clones.
- `<sc-if>`: includes its children iff `value` is truthy; while `value` is `undefined`
  it uses `hint-placeholder-val` to decide.

### `<sc-for>`/`<sc-if>` inside `<table>` works

You can loop table rows directly — the runtime ferries control tags through HTML parsing so they
survive inside `<tbody>` (browsers normally foster-parent custom tags out of tables; our runtime
handles that for you):

```html
<tbody>
  <sc-for list="{{ rows }}" as="row" hint-placeholder-count="6">
    <tr><td>{{ row.cat }}</td><td>{{ row.title }}</td><td>{{ row.streams }}</td></tr>
  </sc-for>
</tbody>
```

Still seed real rows (4-6) for any labeled table — never ship headers-only.

## `<helmet>` — the only place for non-inline rules and scripts

Put `<helmet>…</helmet>` at the **top** of the template. On load our runtime moves its
children into the document `<head>` **first** — fonts, `@font-face`, `@keyframes`, body
resets, font `<link>`s, and (only here) `<script>` tags. `<script>` is legal **only**
inside `<helmet>`; a `<script src>` placed lower in the template would not run until
the stream reached it, leaving everything that depends on it broken until the end.

```html
<helmet>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&display=swap" rel="stylesheet" />
  <style>
    @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.5 } }
    body { margin:0; }
  </style>
</helmet>
```

For post-render JS, use `componentDidMount()` in the logic class rather than a script.

## Inline styles first — and why

**Style everything inline. No stylesheets, no CSS classes, no design-token setup** —
this applies to decks/slides too (repeat the literal values on every slide).

Why: class-based CSS delays everything the user sees until **both** the rules and the
markup have streamed; inline `style="…"` paints immediately, character by character.
The only legal `<helmet><style>` content is what genuinely can't be inline:
`@font-face`, `@keyframes`, body resets.

Corollary anti-pattern: **never put a style or static text behind a `{{ hole }}`**.
`style="{{ cardStyle }}"` or `background: {{ accentColor }}` can't resolve mid-stream,
so that property's paint is delayed exactly like a CSS class. A style hole is
acceptable **only** for a truly live runtime value that cannot exist at parse time (a
live percentage width, user-typed text) — never for theme/prop-driven tokens.

Pseudo-states are expressed as sibling attrs: `style-hover`, `style-active`,
`style-focus`, `style-before`, `style-after`.

Animations: don't drive them from the template — build animated elements with
`React.createElement(...)` in `renderVals()` and expose them by name, so the animation
state survives re-renders. (Our runtime renders to real DOM; reserve `createElement`
for this narrow case, never for layout.)

## One DC by default

High bar for splitting. Designers duplicate a DC to riff on it; shared children break
that. Keep everything in one `<x-dc>` body — a 400-line body is normal, and `<sc-for>`
handles repetition. Only create a **child DC** when the user explicitly asked for
reusable components, OR an element repeats **≥4 times across screens** AND it has real
props/state.

## Presenting options side-by-side (any medium)

When the user wants to **compare 2+ directions** — aesthetic directions for a deck cover,
hero variations for a landing page, layout options for a screen — lay them out as
**labeled frames side-by-side in one DC**, plain markup (not a canvas/artboard), so every
frame stays directly clickable, commentable, and editable. Ask up front how many
variations and what they should explore (visuals / layout / copy / flow).

Recipe — the outer wrapper carries the gray backdrop AND `width:max-content` so the gray
extends with the horizontal scroll; let the **body** scroll (never `overflow:auto` on an
inner wrapper, no pan/zoom). Each frame is `flex:none` with a fixed pixel width, a small
label above a white card. Never center an overflowing row (`justify-content:center` /
`margin:auto`) — it pushes frames off the unreachable left edge.

```html
<div style="width:max-content; min-width:100%; min-height:100vh; box-sizing:border-box;
            padding:48px; background:#e7e5df;">
  <div style="display:flex; gap:40px; align-items:flex-start;">  <!-- start-aligned, never centered -->
    <div style="flex:none; width:420px;">
      <div style="font-size:12px; color:#888; margin-bottom:8px;">A · Warm</div>
      <div style="background:#fff; border-radius:2px; box-shadow:0 1px 3px rgba(0,0,0,.08); padding:40px;">…</div>
    </div>
    <!-- B, C … each flex:none with its own fixed width -->
  </div>
</div>
```

Prefer adding variations to the existing DC (more frames, or a small in-design switcher)
over forking into many files.

## Composition — `dc-import` and `x-import` (always `hint-size`)

Both mount external content; both **must** carry `hint-size="W,H"` (the placeholder +
min-size shown while the child streams/loads), and both **must** be written with an
explicit close tag — never self-close `<dc-import … />` or `<x-import … />`.

**`<dc-import>`** mounts a sibling DC file (`name` = file basename, no extension; the
runtime fetches `Name.dc.html` from the current dir). Other attrs become props
(kebab→camel). `style` position/size props apply to the mount. The child reads props
by name in its template; the child's `renderVals()` keys override its props.

```html
<dc-import name="Card" item="{{ it }}" hint-size="100%,120px"></dc-import>
```

Never use a capitalized JSX tag like `<Card />` — unsupported.

**`<x-import>`** mounts a component from a sibling JS/JSX file:

- `component="Chart" from="./Chart.jsx"` → loads/evaluates the module
  (`module.exports = { Chart }` or `window.Chart`). `.js` runs directly; `.jsx` is
  transpiled lazily **only if** Babel-standalone is reachable, else the runtime warns
  and shows the `hint-size` placeholder. Only for pre-existing/copied components —
  never author new UI as `.jsx`; it doesn't stream.
- `component-from-global-scope="tag-or-global" from="./file.js"` → loads a script that
  registers itself. Pass the **custom-element tag name** for a `customElements.define`
  web component, or the **global name** (dotted ok, `NS.Button` → `window.NS.Button`)
  for a `window`-registered factory.

Rules: `from` must be a **literal URL** (the fetch starts at parse time, before any
values exist — a `{{ }}` there never loads). The `component*` name attrs DO accept
`{{ }}` and re-resolve per render. Template children pass through as `props.children`.
Importing the same file N times fetches/evaluates it once. `style` position/size props
apply to the mount.

## Logic class (`<script type="dc-logic">`)

```js
class Component extends DCLogic {
  state = { n: 0 };
  componentDidMount() { /* post-render setup */ }
  renderVals() {
    return {
      n: this.state.n,
      inc: () => this.setState(s => ({ n: s.n + 1 })),
    };
  }
}
```

Plain classic JavaScript — no TypeScript, no `import`/`export`. `DCLogic` is injected.
You get `this.props`, `this.state`, `setState(updaterOrObj)` (merge + re-render),
`forceUpdate()`, and lifecycle (`componentDidMount`), like a React class component
**minus `render()`**. `renderVals()` returns the template's inputs — flat values,
arrays, handlers, refs. Anything you'd write as a JSX expression (ternary, `.map`,
comparison) belongs here, exposed by name. Use `this.props.x ?? default` for fallbacks.

Shared business logic (formatters, default data) may live in a plain `.js` ES module
referenced via `<x-import>` or dynamic `import()` — never a `tokens.js` (styling stays
inline).

## Examples (copy-pasteable, render under our runtime)

### 1. Static card (template-only, no logic)

```html
<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
  <x-dc>
    <helmet>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500..600&display=swap" rel="stylesheet" />
      <style> body { margin:0; } </style>
    </helmet>
    <div style="font-family:Fraunces,serif; padding:32px; max-width:380px; background:#faf8f4; border:1px solid #e7e2d8; border-radius:4px;">
      <div data-label="Card" style="display:flex; flex-direction:column; gap:8px;">
        <span style="font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:#b8462e;">Featured</span>
        <h2 style="margin:0; font-size:28px; color:#1a1a1a;">The quiet card</h2>
        <p style="margin:0; font-size:15px; line-height:1.5; color:#55514a;">A small, inline-styled fragment that paints from the first character.</p>
      </div>
    </div>
  </x-dc>
  <script type="dc-logic" data-props='{ "$preview": { "width": 420, "height": 240 } }'></script>
  <script src="support.js"></script>
</body>
</html>
```

### 2. `<sc-for>` list driven by a `DCLogic` counter

```html
<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
  <x-dc>
    <div style="font-family:system-ui,sans-serif; padding:24px; max-width:360px; display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <button onClick="{{ dec }}" style="width:36px; height:36px; border:1px solid #ccc; background:#fff; border-radius:6px; font-size:18px; cursor:pointer;">-</button>
        <strong style="font-size:20px; min-width:24px; text-align:center;">{{ count }}</strong>
        <button onClick="{{ inc }}" style="width:36px; height:36px; border:1px solid #ccc; background:#fff; border-radius:6px; font-size:18px; cursor:pointer;">+</button>
      </div>

      <sc-for list="{{ rows }}" as="row" hint-placeholder-count="3">
        <div style="padding:10px 14px; background:#f3f1ec; border-radius:6px; display:flex; justify-content:space-between;">
          <span>Item {{ $index }}</span>
          <span style="color:#888;">{{ row.label }}</span>
        </div>
      </sc-for>
    </div>
  </x-dc>

  <script type="dc-logic" data-props='{ "$preview": { "width": 400, "height": 320 } }'>
    class Component extends DCLogic {
      state = { count: 3 };
      renderVals() {
        const n = this.state.count;
        return {
          count: n,
          inc: () => this.setState(s => ({ count: s.count + 1 })),
          dec: () => this.setState(s => ({ count: Math.max(0, s.count - 1) })),
          // derived array — computed here, never as a {{ expression }} in the template
          rows: Array.from({ length: n }, (_, i) => ({ label: "row " + (i + 1) })),
        };
      }
    }
  </script>

  <script src="support.js"></script>
</body>
</html>
```

### 3. Slide deck via `x-import` of `deck-stage`

First copy the starter (`starters/deck_stage.js`) next to your DC in the project dir,
then mount it. Slides are inline-styled `<section data-label data-speaker-notes>`
children — never set position/inset; the stage scales and positions them.

```html
<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
  <x-dc>
    <helmet>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&display=swap" rel="stylesheet" />
    </helmet>

    <x-import component-from-global-scope="deck-stage" from="./deck_stage.js"
              width="1920" height="1080" hint-size="100%,100%">
      <section data-label="Title" data-speaker-notes="Open warm, 30 seconds"
               style="width:100%; height:100%; box-sizing:border-box; padding:140px; background:#1a1a1a; color:#faf8f4; font-family:Fraunces,serif; display:flex; flex-direction:column; justify-content:center; gap:24px;">
        <h1 style="margin:0; font-size:96px; line-height:1.05;">The quiet deck</h1>
        <p style="margin:0; font-size:36px; color:#b8a;">A presentation that scales to fit.</p>
      </section>

      <section data-label="Thesis" data-speaker-notes="Two minutes max"
               style="width:100%; height:100%; box-sizing:border-box; padding:140px; background:#faf8f4; color:#1a1a1a; font-family:Fraunces,serif; display:flex; align-items:center;">
        <h2 style="margin:0; font-size:72px; line-height:1.1;">One idea, stated plainly and large.</h2>
      </section>
    </x-import>
  </x-dc>

  <script type="dc-logic" data-props='{}'></script>
  <script src="support.js"></script>
</body>
</html>
```

## Anti-patterns — DO NOT

- A second document scaffold (`<!doctype>`/`<html>`/`<x-dc>`) nested inside `<x-dc>`.
- Class-based stylesheets, or a `<script src>` in the template body (helmet/x-import only).
- JS in template holes (`{{ a + b }}`, `{{ !x }}`, `{{ fn() }}`) — compute in `renderVals()`.
- Static styles/text behind `{{ }}` holes (`style="{{ cardStyle }}"`) — delays painting.
- UI layout via `React.createElement` exposed through a hole — write it as template markup.
- Capitalized component tags (`<Card />`) — use `<dc-import name="Card">`.
- Missing `hint-*` on `<sc-for>`/`<sc-if>`, or missing `hint-size` on `dc-import`/`x-import`.
- Self-closing `<dc-import … />` / `<x-import … />` — always an explicit close tag.
- Forgetting `<script src="support.js"></script>` last, or naming the logic class anything but `Component`.

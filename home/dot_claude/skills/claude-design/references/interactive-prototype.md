# Interactive Prototype

You're building a working app mockup — a prototype someone can click through and believe is real.
Not a screenshot, not a slide of a screen: an actual interactive thing with state, navigation
between screens, and handlers that respond. The whole point is that it *behaves*.

Build it as a single Design Component (`Name.dc.html`). The DC runtime (`support.js`) gives you a
React-class-like `Component extends DCLogic` with `state` / `setState` / `renderVals()` /
`componentDidMount()` — that is your interactivity engine. Read `design-components.md` first if you
haven't; everything below assumes you know the template + logic split.

## Embody a UX designer, not a web designer

A prototype is a product surface, not a web page. Avoid web-design tropes (hero sections, marketing
footers, cookie banners) unless the thing you're prototyping is literally a website. Match the
conventions of the platform you're imitating: an iOS app has a status bar, large titles, a tab bar,
and 44px+ hit targets; a desktop tool has a sidebar, toolbars, and dense rows. Get the platform's
visual vocabulary right and the prototype reads as real.

## The interactivity model

State lives in the logic class. The template reads it through holes and drives it through handlers.

```js
class Component extends DCLogic {
  state = { screen: "home", cart: [], query: "" };
  renderVals() {
    const { screen, cart, query } = this.state;
    return {
      screen, cart, query,
      cartCount: cart.length,
      results: PRODUCTS.filter(p => p.name.toLowerCase().includes(query.toLowerCase())),
      go: (s) => this.setState({ screen: s }),
      add: (p) => this.setState(st => ({ cart: [...st.cart, p] })),
      setQuery: (e) => this.setState({ query: e.target.value }),
    };
  }
}
```

- **Multiple screens.** Keep them in one `state.screen` string (or a small nav stack array for
  back-button flows) and gate each screen with `<sc-if value="{{ ... }}">`. Compute the booleans in
  `renderVals()` (`isHome: screen === "home"`) — holes are dotted lookups only, never expressions.
- **Event handlers** are whole-value attributes with JSX camelCase: `onClick="{{ go }}"`,
  `onInput="{{ setQuery }}"`. The runtime lowercases and `addEventListener`s them. Expose every
  handler by name from `renderVals()`.
- **Lists** use `<sc-for list="{{ results }}" as="item" hint-placeholder-count="4">`; `$index` is in
  scope. Always set `hint-placeholder-count` so the list paints while data is `undefined`.
- **setState re-renders** the subtree. Don't store derived data in state — derive it in
  `renderVals()` each render.

## Make it feel alive

- **Real, specific data.** Seed a realistic dataset as a top-of-file const in the logic
  (`const PRODUCTS = [...]`) — real names, plausible prices, varied lengths. No "Item 1 / Item 2",
  no lorem ipsum, no obviously-fake numbers. One thousand no's: don't pad with filler rows just to
  fill the screen.
- **Wire the obvious interactions.** If there's a search box, typing filters. If there's a cart icon,
  it shows a live count and tapping it opens the cart. If there's a toggle, it toggles something
  visible. A button that does nothing breaks the illusion — either wire it or leave it out.
- **Stateful affordances:** selected tab highlights, disabled states, empty states ("No results for
  '…'"), loading shimmers via a `state.loading` flag flipped in `componentDidMount` with a
  `setTimeout`. These are what separate a prototype from a mockup.
- **Charts plot real data — never axes-only.** The single most common dashboard failure is an empty
  chart (gridlines + legend, no marks). The reliable fix: **use the `charts.js` starter** — copy it
  in and use `<cd-bar-chart>` / `<cd-line-chart>` / `<cd-donut-chart>` / `<cd-sparkline>` with your
  real `data` JSON (see `charts.md`). They always render marks. Hand-build only if you want full
  control. Either way, confirm every chart shows visible bars/line/arcs before finishing.
- **Tables must have rows.** Never ship a table that is column-headers-only. Seed at least 4-6
  realistic rows for any "Top merchants / Leaderboard / Ledger" panel. A labeled-but-empty card or
  table reads as broken — fill it with real content or remove it.
- **Loop table rows with `<sc-for>` inside `<tbody>`** (the runtime supports it) or hardcode them —
  either way, seed real data.

## Frame it like a device

Wrap the screen in a device-frame-ish container so the prototype reads as an app, not a full-bleed
web page. Center a fixed-size canvas on a neutral backdrop:

```html
<div style="min-height:100vh; display:grid; place-items:center; background:#e7e5df; padding:40px">
  <div style="width:390px; height:844px; background:#fff; border-radius:44px;
              box-shadow:0 24px 60px rgba(0,0,0,.18); overflow:hidden; position:relative">
    <!-- status bar, then your <sc-if> screens, then a fixed tab bar -->
  </div>
</div>
```

390×844 is iPhone-ish; use 1280×800 with a window chrome for desktop. If you need real device bezels
or window chrome, mount a starter via `<x-import component="ios_frame" from="./ios_frame.jsx" …>`
when one is available — otherwise the simple rounded container above is enough. Keep hit targets
≥44px and type ≥15px inside a phone frame.

- **Fill the frame — no dead voids.** The content must fill the device/panel height, not float in
  the top third over a large empty gap. Either compose enough real content to reach the bottom, or
  pin chrome to the edges: make the frame a `display:flex; flex-direction:column`, give the scrolling
  body `flex:1`, and anchor the status bar at top and tab bar at bottom so the body always spans the
  gap. If a screen genuinely has little content, shrink the frame to its content (`height` → drop the
  fixed `844px`, let it size naturally) rather than leaving a labeled-but-empty void.
- **One consistent frame across screens.** Every screen in the flow uses the *same* device frame and
  the same fit-to-viewport convention — don't let one screen be 390-wide and another full-bleed. Put
  the frame markup once and switch only the inner `<sc-if>` body.

## Styling

Inline styles only (see `design-components.md`) — paint immediately, survive direct edits. No
stylesheets. Use `flex`/`grid` with `gap` for every row of buttons, tabs, or cards so spacing
survives drag-reorder edits in the preview. Commit to one type pairing and a restrained palette; if
there's no brand, read `frontend-design.md` and pick a direction rather than defaulting to Inter on
white. Avoid gradient-soup backgrounds and emoji-as-icons.

## One DC, many screens

Keep the whole flow in one file — screens are `<sc-if>` sections, repeated rows are `<sc-for>`. Only
split a child DC out when a component genuinely repeats ≥4 times with real props/state. A 400-line
`<x-dc>` body is normal and good. When the user asks for a variation of a flow, add it as another
screen or a switcher inside the same DC rather than forking the file.

## Finishing

Write the file into the project dir, then it renders live in the preview. When the user comments on a
screen, the event names the nearest `[data-screen-label]` — so label each screen's root element
(`data-screen-label="Cart"`) so you can tell which screen a comment is about.

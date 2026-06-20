(function () {
  "use strict";

  // Idempotent guard: skip if <deck-stage> is already registered (re-injection / live-reload).
  if (typeof customElements === "undefined" || customElements.get("deck-stage")) {
    return;
  }

  class DeckStage extends HTMLElement {
    constructor() {
      super();
      this._index = 0;
      this._slides = [];
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onResize = this._onResize.bind(this);
    }

    get canvasWidth() {
      return parseInt(this.getAttribute("width"), 10) || 1920;
    }
    get canvasHeight() {
      return parseInt(this.getAttribute("height"), 10) || 1080;
    }

    connectedCallback() {
      if (!this.shadowRoot) {
        this._buildShadow();
      }
      this._collectSlides();
      this._index = Math.max(0, Math.min(this._index, Math.max(0, this._slides.length - 1)));
      this._applyLayout();
      this._render();

      window.addEventListener("keydown", this._onKeyDown);
      window.addEventListener("resize", this._onResize);

      this._observer = new MutationObserver(() => {
        this._collectSlides();
        this._index = Math.max(0, Math.min(this._index, Math.max(0, this._slides.length - 1)));
        this._render();
      });
      this._observer.observe(this, { childList: true });
    }

    disconnectedCallback() {
      window.removeEventListener("keydown", this._onKeyDown);
      window.removeEventListener("resize", this._onResize);
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
    }

    _buildShadow() {
      const root = this.attachShadow({ mode: "open" });
      // Light-DOM <section> slides stay in the light DOM (so the preview-agent can build
      // descriptors over real authored content) and are projected through <slot>.
      root.innerHTML = `
        <style>
          :host {
            display: block;
            position: relative;
            width: 100%;
            height: 100%;
            min-height: 100vh;
            background: #0b0b0c;
            overflow: hidden;
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
          }
          .viewport {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .stage {
            position: relative;
            transform-origin: center center;
            transform: scale(var(--scale, 1));
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
            background: #ffffff;
            overflow: hidden;
          }
          ::slotted(section) {
            display: none !important;
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            overflow: hidden;
          }
          ::slotted(section.deck-stage--active) {
            display: block !important;
          }
          .overlay {
            position: absolute;
            left: 50%;
            bottom: 18px;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 7px 14px;
            border-radius: 999px;
            background: rgba(20, 20, 22, 0.72);
            color: #f4f4f5;
            font-size: 13px;
            line-height: 1;
            letter-spacing: 0.02em;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            user-select: none;
            pointer-events: none;
            z-index: 2147483000;
          }
          .overlay .counter {
            font-variant-numeric: tabular-nums;
            opacity: 0.85;
          }
          .overlay .label {
            max-width: 48vw;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 600;
          }
          .overlay .sep {
            width: 1px;
            height: 12px;
            background: rgba(255, 255, 255, 0.25);
          }
          [hidden] {
            display: none !important;
          }
          .empty {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #9ca3af;
            font-size: 16px;
          }
        </style>
        <div class="viewport" part="viewport">
          <div class="stage" part="stage">
            <slot></slot>
          </div>
        </div>
        <div class="overlay" data-cd-agent part="overlay" hidden>
          <span class="label"></span>
          <span class="sep"></span>
          <span class="counter"></span>
        </div>
        <div class="empty" hidden>No slides yet.</div>
      `;

      this._viewport = root.querySelector(".viewport");
      this._stage = root.querySelector(".stage");
      this._overlay = root.querySelector(".overlay");
      this._labelEl = root.querySelector(".overlay .label");
      this._counterEl = root.querySelector(".overlay .counter");
      this._sepEl = root.querySelector(".overlay .sep");
      this._emptyEl = root.querySelector(".empty");

      this._viewport.addEventListener("click", (e) => {
        if (!this._slides.length) return;
        const rect = this._viewport.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width * 0.25) {
          this.prev();
        } else {
          this.next();
        }
      });
    }

    _collectSlides() {
      this._slides = Array.prototype.filter.call(this.children, function (el) {
        return el.tagName === "SECTION";
      });
    }

    _applyLayout() {
      this._stage.style.width = this.canvasWidth + "px";
      this._stage.style.height = this.canvasHeight + "px";
      this._updateScale();
    }

    _updateScale() {
      // "contain": largest uniform scale that fits the fixed canvas inside the viewport.
      const availW = this.clientWidth || window.innerWidth;
      const availH = this.clientHeight || window.innerHeight;
      const scale = Math.min(availW / this.canvasWidth, availH / this.canvasHeight) || 1;
      this._stage.style.setProperty("--scale", String(scale));
    }

    _fitActiveSlide() {
      const sec = this._slides[this._index];
      if (!sec) return;
      let wrap = sec.querySelector(":scope > [data-cd-fit]");
      if (!wrap) {
        const cs = getComputedStyle(sec);
        wrap = document.createElement("div");
        wrap.setAttribute("data-cd-fit", "");
        wrap.style.boxSizing = "border-box";
        wrap.style.width = "100%";
        wrap.style.height = "100%";
        wrap.style.transformOrigin = "top left";
        [
          "display", "flexDirection", "flexWrap", "justifyContent",
          "alignItems", "alignContent", "gap", "rowGap", "columnGap",
          "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
          "textAlign",
        ].forEach((p) => { wrap.style[p] = cs[p]; });
        while (sec.firstChild) wrap.appendChild(sec.firstChild);
        sec.style.padding = "0";
        sec.style.display = "block";
        sec.appendChild(wrap);
      }
      wrap.style.transform = "";
      const secR = sec.getBoundingClientRect();
      const scale = sec.offsetWidth ? secR.width / sec.offsetWidth : 1;
      let maxR = secR.left;
      let maxB = secR.top;
      const all = wrap.querySelectorAll("*");
      for (let i = 0; i < all.length; i++) {
        const r = all[i].getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > maxR) maxR = r.right;
        if (r.bottom > maxB) maxB = r.bottom;
      }
      const contentW = (maxR - secR.left) / (scale || 1);
      const contentH = (maxB - secR.top) / (scale || 1);
      const cw = sec.clientWidth;
      const ch = sec.clientHeight;
      const k = Math.min(1, cw / Math.max(contentW, 1), ch / Math.max(contentH, 1));
      if (k < 0.999) {
        const tx = (cw - contentW * k) / 2;
        const ty = (ch - contentH * k) / 2;
        wrap.style.transform =
          "translate(" + tx + "px," + ty + "px) scale(" + k + ")";
      } else {
        wrap.style.transform = "";
      }
    }

    _onResize() {
      this._updateScale();
      this._fitActiveSlide();
    }

    _onKeyDown(e) {
      if (!this._slides.length) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
          e.preventDefault();
          this.next();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          this.prev();
          break;
        case "Home":
          e.preventDefault();
          this.go(0);
          break;
        case "End":
          e.preventDefault();
          this.go(this._slides.length - 1);
          break;
        default:
          break;
      }
    }

    next() {
      this.go(this._index + 1);
    }
    prev() {
      this.go(this._index - 1);
    }
    go(i) {
      if (!this._slides.length) return;
      const clamped = Math.max(0, Math.min(i, this._slides.length - 1));
      if (clamped === this._index) return;
      this._index = clamped;
      this._render();
    }

    _render() {
      const total = this._slides.length;
      const hasSlides = total > 0;
      this._emptyEl.hidden = hasSlides;
      this._overlay.hidden = !hasSlides;
      this._stage.style.visibility = hasSlides ? "visible" : "hidden";

      if (!hasSlides) return;

      for (let i = 0; i < total; i++) {
        this._slides[i].classList.toggle("deck-stage--active", i === this._index);
      }

      const active = this._slides[this._index];
      const label = active ? active.getAttribute("data-label") : null;
      this._labelEl.textContent = label || "";
      this._counterEl.textContent = this._index + 1 + " / " + total;
      this._sepEl.style.display = label ? "" : "none";
      this._labelEl.style.display = label ? "" : "none";

      this._updateScale();
      this._fitActiveSlide();
      const refit = () => this._fitActiveSlide();
      requestAnimationFrame(refit);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
      setTimeout(refit, 350);
    }
  }

  customElements.define("deck-stage", DeckStage);

  if (typeof window !== "undefined") {
    window.DeckStage = DeckStage;
  }
})();

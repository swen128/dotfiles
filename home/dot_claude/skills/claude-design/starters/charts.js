(function () {
  if (window.__cdChartsInstalled) return;
  window.__cdChartsInstalled = true;

  function parseData(el, fallback) {
    var raw = el.getAttribute("data");
    if (!raw) return fallback;
    try {
      var v = JSON.parse(raw);
      if (Array.isArray(v) && v.length) return v;
    } catch (e) {}
    return fallback;
  }
  function num(el, attr, dflt) {
    var v = parseFloat(el.getAttribute(attr));
    return isNaN(v) ? dflt : v;
  }
  function attr(el, a, dflt) {
    var v = el.getAttribute(a);
    return v == null ? dflt : v;
  }
  function val(d) { return typeof d === "number" ? d : +d.value; }
  function lab(d, i) { return typeof d === "number" ? String(i + 1) : d.label != null ? d.label : String(i + 1); }
  function svg(w, h, body) {
    return (
      '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" ' +
      'style="display:block;width:100%;height:100%;overflow:visible;font-family:inherit">' + body + "</svg>"
    );
  }

  var BaseHost =
    "display:block;position:relative;box-sizing:border-box;width:100%;min-height:120px;";

  function renderBar(el) {
    var data = parseData(el, [
      { label: "Mon", value: 32 }, { label: "Tue", value: 58 }, { label: "Wed", value: 41 },
      { label: "Thu", value: 73 }, { label: "Fri", value: 64 }, { label: "Sat", value: 88 },
    ]);
    var accent = attr(el, "accent", "#c8643f");
    var track = attr(el, "track", "rgba(0,0,0,.07)");
    var labelColor = attr(el, "label-color", "currentColor");
    var max = Math.max.apply(null, data.map(val)).valueOf() || 1;
    var n = data.length;
    var gap = 14;
    var bars = data.map(function (d, i) {
      var bw = (100 - gap * (n - 1) / 6) / n;
      var x = (100 / n) * i;
      var hpct = (val(d) / max) * 78;
      return (
        '<g>' +
        '<rect x="' + (x + 1) + '" y="' + (88 - hpct) + '" width="' + (100 / n - 4) + '" height="' + hpct + '" rx="0.6" fill="' + accent + '"></rect>' +
        '<text x="' + (x + (100 / n) / 2) + '" y="96" fill="' + labelColor + '" font-size="3.2" text-anchor="middle" opacity="0.65">' + lab(d, i) + "</text>" +
        '<text x="' + (x + (100 / n) / 2) + '" y="' + (85 - hpct) + '" fill="' + labelColor + '" font-size="3.4" text-anchor="middle">' + val(d) + "</text>" +
        "</g>"
      );
    }).join("");
    var grid = "";
    el.innerHTML = svg(100, 100, grid + bars);
  }

  function renderLine(el) {
    var data = parseData(el, [12, 19, 15, 27, 24, 33, 38, 31, 44, 49]).map(function (d) { return val(d); });
    var accent = attr(el, "accent", "#c8643f");
    var area = attr(el, "area", "false") === "true";
    var max = Math.max.apply(null, data), min = Math.min.apply(null, data);
    var span = max - min || 1;
    var n = data.length;
    var pts = data.map(function (v, i) {
      var x = (i / (n - 1)) * 96 + 2;
      var y = 90 - ((v - min) / span) * 78;
      return [x, y];
    });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2); }).join(" ");
    var areaPath = line + " L98 90 L2 90 Z";
    var dots = pts.map(function (p) { return '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="0.9" fill="' + accent + '"></circle>'; }).join("");
    var body =
      (area ? '<path d="' + areaPath + '" fill="' + accent + '" opacity="0.14"></path>' : "") +
      '<path d="' + line + '" fill="none" stroke="' + accent + '" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"></path>' +
      dots;
    el.innerHTML = svg(100, 100, body);
  }

  function renderDonut(el) {
    var palette = ["#c8643f", "#1a1814", "#7a9e7e", "#d8b46a", "#9a8cc4"];
    var data = parseData(el, null);
    var center = attr(el, "center", null);
    var segs;
    if (data) {
      segs = data.map(function (d, i) { return { v: val(d), c: (d.color || palette[i % palette.length]), l: lab(d, i) }; });
    } else {
      var pct = num(el, "value", 68);
      segs = [{ v: pct, c: attr(el, "accent", "#c8643f"), l: "" }, { v: 100 - pct, c: attr(el, "track", "rgba(0,0,0,.08)"), l: "" }];
      if (center == null) center = pct + "%";
    }
    var total = segs.reduce(function (a, s) { return a + s.v; }, 0) || 1;
    var R = 38, C = 2 * Math.PI * R, off = 0;
    var ring = segs.map(function (s) {
      var len = (s.v / total) * C;
      var seg = '<circle cx="50" cy="50" r="' + R + '" fill="none" stroke="' + s.c + '" stroke-width="14" stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 50 50)"></circle>';
      off += len;
      return seg;
    }).join("");
    var label = center != null ? '<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="600" fill="currentColor">' + center + "</text>" : "";
    el.innerHTML = svg(100, 100, ring + label);
  }

  function renderSpark(el) {
    var data = parseData(el, [4, 6, 5, 8, 7, 10, 9, 13, 12, 16]).map(val);
    var accent = attr(el, "accent", "currentColor");
    var max = Math.max.apply(null, data), min = Math.min.apply(null, data), span = max - min || 1, n = data.length;
    var line = data.map(function (v, i) { return (i ? "L" : "M") + ((i / (n - 1)) * 100).toFixed(2) + " " + (28 - ((v - min) / span) * 26).toFixed(2); }).join(" ");
    el.innerHTML = svg(100, 30, '<path d="' + line + '" fill="none" stroke="' + accent + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>');
  }

  function define(tag, render) {
    if (customElements.get(tag)) return;
    customElements.define(tag, class extends HTMLElement {
      connectedCallback() { this.style.cssText += BaseHost; this._render(); }
      _render() { try { render(this); } catch (e) { this.innerHTML = ""; } }
      static get observedAttributes() { return ["data", "value", "accent", "area", "center"]; }
      attributeChangedCallback() { if (this.isConnected) this._render(); }
    });
  }
  define("cd-bar-chart", renderBar);
  define("cd-line-chart", renderLine);
  define("cd-donut-chart", renderDonut);
  define("cd-sparkline", renderSpark);
})();

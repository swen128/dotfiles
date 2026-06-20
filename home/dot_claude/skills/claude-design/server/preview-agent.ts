(function () {
  "use strict";

  if (window.__cdAgentInstalled) return;
  window.__cdAgentInstalled = true;

  var projectId = "default";
  var file = "";
  (function deriveIdentity() {
    var parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "serve" && parts.length >= 2) {
      projectId = decodeURIComponent(parts[1]);
      file = parts.slice(2).map(decodeURIComponent).join("/");
    }
  })();

  var mode = "browse";
  var hoverEl = null;

  var host = document.createElement("div");
  host.setAttribute("data-cd-agent", "");
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  var shadow = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent =
    ":host{all:initial;}" +
    "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
    ".outline{position:fixed;pointer-events:none;border:2px solid #b8462e;border-radius:3px;" +
    "z-index:2147483646;transition:all .04s ease-out;box-shadow:0 0 0 1px rgba(255,255,255,.4);}" +
    ".outline.style-mode{border-color:#2e6ab8;}" +
    ".outline.text-mode{border-color:#2e9b6a;}" +
    ".panel{position:fixed;z-index:2147483647;background:#fff;color:#1a1a1a;border:1px solid #d9d9d9;" +
    "border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:10px;font-size:13px;min-width:220px;}" +
    ".panel textarea{width:100%;min-height:60px;resize:vertical;border:1px solid #d0d0d0;border-radius:6px;" +
    "padding:6px 8px;font-size:13px;font-family:inherit;outline:none;}" +
    ".panel textarea:focus{border-color:#b8462e;}" +
    ".row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0;}" +
    ".row label{color:#555;white-space:nowrap;}" +
    ".row input[type=color]{width:34px;height:24px;border:1px solid #d0d0d0;border-radius:4px;padding:0;background:#fff;cursor:pointer;}" +
    ".row input[type=number]{width:64px;border:1px solid #d0d0d0;border-radius:4px;padding:3px 5px;font-size:13px;}" +
    ".btns{display:flex;justify-content:flex-end;gap:6px;margin-top:8px;}" +
    "button{font-family:inherit;font-size:12px;border-radius:6px;padding:5px 10px;cursor:pointer;border:1px solid #d0d0d0;background:#f6f6f6;color:#222;}" +
    "button.primary{background:#b8462e;border-color:#b8462e;color:#fff;}" +
    ".hint{color:#888;font-size:11px;margin-bottom:6px;}";
  shadow.appendChild(style);

  var outline = document.createElement("div");
  outline.className = "outline";
  outline.style.display = "none";
  shadow.appendChild(outline);

  var panelHost = null;

  function mountHost() {
    if (document.body) document.body.appendChild(host);
    else document.documentElement.appendChild(host);
  }
  if (document.body) mountHost();
  else document.addEventListener("DOMContentLoaded", mountHost);

  function isAgentNode(el) {
    if (!el || el.nodeType !== 1) return true;
    return (
      !!el.closest("[data-cd-agent]") ||
      el === host ||
      el === document.body ||
      el === document.documentElement
    );
  }

  function snippet(el) {
    var t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return t.length > 80 ? t.slice(0, 80) : t;
  }

  function nearestLabel(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      if (n.hasAttribute("data-label")) return n.getAttribute("data-label");
      if (n.hasAttribute("data-screen-label"))
        return n.getAttribute("data-screen-label");
      if (n.hasAttribute("data-screen")) return n.getAttribute("data-screen");
      n = n.parentElement;
    }
    return null;
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    var segs = [];
    var n = el;
    while (
      n &&
      n.nodeType === 1 &&
      n !== document.body &&
      n !== document.documentElement
    ) {
      var tag = n.tagName.toLowerCase();
      var nthOfType = 1;
      var sib = n;
      while ((sib = sib.previousElementSibling)) {
        if (sib.tagName === n.tagName) nthOfType++;
      }
      segs.unshift(tag + ":nth-of-type(" + nthOfType + ")");
      n = n.parentElement;
    }
    return "body" + (segs.length ? " > " + segs.join(" > ") : "");
  }

  function describe(el) {
    return {
      tag: el.tagName.toLowerCase(),
      path: cssPath(el),
      label: nearestLabel(el),
      text: snippet(el),
    };
  }

  function showOutline(el, extraClass) {
    if (!el) {
      outline.style.display = "none";
      return;
    }
    var r = el.getBoundingClientRect();
    outline.className = "outline" + (extraClass ? " " + extraClass : "");
    outline.style.display = "block";
    outline.style.top = r.top + "px";
    outline.style.left = r.left + "px";
    outline.style.width = r.width + "px";
    outline.style.height = r.height + "px";
  }
  function hideOutline() {
    outline.style.display = "none";
  }

  function targetAt(e) {
    var el = e.target;
    if (isAgentNode(el)) {
      var under = document.elementFromPoint(e.clientX, e.clientY);
      if (under && !isAgentNode(under)) el = under;
      else return null;
    }
    return el && el.nodeType === 1 && !isAgentNode(el) ? el : null;
  }

  function textLeaf(el) {
    if (!el) return null;
    if (el.children.length === 0 && (el.textContent || "").trim().length > 0)
      return el;
    return el;
  }

  function postEvent(payload, element) {
    var body = Object.assign({ file: file }, payload);
    fetch("/api/event?id=" + encodeURIComponent(projectId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .catch(function () {})
      .finally(function () {
        try {
          parent.postMessage(
            {
              __cd: true,
              evt: "event-sent",
              type: payload.type,
              element: element,
            },
            "*"
          );
        } catch (_) {}
      });
  }

  function removePanel() {
    if (panelHost) {
      panelHost.remove();
      panelHost = null;
    }
  }

  function placePanel(panel, x, y) {
    panel.style.left = "0px";
    panel.style.top = "0px";
    shadow.appendChild(panel);
    var pw = panel.offsetWidth || 240;
    var ph = panel.offsetHeight || 120;
    var left = Math.min(x, window.innerWidth - pw - 8);
    var top = Math.min(y, window.innerHeight - ph - 8);
    panel.style.left = Math.max(8, left) + "px";
    panel.style.top = Math.max(8, top) + "px";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function openCommentPanel(el, x, y) {
    removePanel();
    var desc = describe(el);
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML =
      '<div class="hint">Comment on &lt;' +
      desc.tag +
      "&gt;" +
      (desc.label ? " · " + escapeHtml(desc.label) : "") +
      "</div>";
    var ta = document.createElement("textarea");
    ta.placeholder = "Describe the change you want…";
    panel.appendChild(ta);
    var btns = document.createElement("div");
    btns.className = "btns";
    var cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    var send = document.createElement("button");
    send.className = "primary";
    send.textContent = "Send";
    btns.appendChild(cancel);
    btns.appendChild(send);
    panel.appendChild(btns);

    cancel.addEventListener("click", removePanel);
    function submit() {
      var text = ta.value.trim();
      if (text) postEvent({ type: "comment", element: desc, comment: text }, desc);
      removePanel();
    }
    send.addEventListener("click", submit);
    ta.addEventListener("keydown", function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") submit();
      if (ev.key === "Escape") removePanel();
    });

    panelHost = panel;
    placePanel(panel, x, y);
    ta.focus();
  }

  function rgbToHex(rgb) {
    if (!rgb) return null;
    if (rgb[0] === "#") return rgb;
    var m = rgb.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(",").map(function (x) {
      return parseFloat(x.trim());
    });
    if (p.length < 3) return null;
    function h(n) {
      var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return s.length === 1 ? "0" + s : s;
    }
    return "#" + h(p[0]) + h(p[1]) + h(p[2]);
  }

  function makeColorRow(labelText, value) {
    var row = document.createElement("div");
    row.className = "row";
    var label = document.createElement("label");
    label.textContent = labelText;
    var input = document.createElement("input");
    input.type = "color";
    input.value = value;
    row.appendChild(label);
    row.appendChild(input);
    return { row: row, input: input };
  }

  function openStylePanel(el, x, y) {
    removePanel();
    var desc = describe(el);
    var cs = getComputedStyle(el);
    var curColor = rgbToHex(cs.color) || "#000000";
    var curBg = rgbToHex(cs.backgroundColor) || "#ffffff";
    var curSize = Math.round(parseFloat(cs.fontSize) || 16);

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = '<div class="hint">Style &lt;' + desc.tag + "&gt;</div>";

    var colorRow = makeColorRow("Color", curColor);
    var bgRow = makeColorRow("Background", curBg);
    var sizeRow = document.createElement("div");
    sizeRow.className = "row";
    sizeRow.innerHTML = "<label>Font size</label>";
    var sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "1";
    sizeInput.value = String(curSize);
    sizeRow.appendChild(sizeInput);

    panel.appendChild(colorRow.row);
    panel.appendChild(bgRow.row);
    panel.appendChild(sizeRow);

    var btns = document.createElement("div");
    btns.className = "btns";
    var close = document.createElement("button");
    close.textContent = "Done";
    close.className = "primary";
    btns.appendChild(close);
    panel.appendChild(btns);
    close.addEventListener("click", removePanel);

    function applyStyle(property, oldValue, newValue) {
      if (oldValue === newValue) return;
      el.style.setProperty(property, newValue);
      postEvent(
        {
          type: "edit-style",
          element: desc,
          property: property,
          oldValue: oldValue,
          newValue: newValue,
        },
        desc
      );
    }

    colorRow.input.addEventListener("change", function () {
      var nv = colorRow.input.value;
      applyStyle("color", curColor, nv);
      curColor = nv;
    });
    bgRow.input.addEventListener("change", function () {
      var nv = bgRow.input.value;
      applyStyle("background-color", curBg, nv);
      curBg = nv;
    });
    sizeInput.addEventListener("change", function () {
      var nv = sizeInput.value + "px";
      applyStyle("font-size", curSize + "px", nv);
      curSize = parseFloat(sizeInput.value);
    });

    panelHost = panel;
    placePanel(panel, x, y);
  }

  var editingEl = null;
  var editingOld = "";

  function beginTextEdit(el) {
    var leaf = textLeaf(el);
    if (!leaf || leaf === editingEl) return;
    finishTextEdit();
    editingEl = leaf;
    editingOld = leaf.textContent || "";
    leaf.setAttribute("contenteditable", "true");
    leaf.style.outline = "2px solid #2e9b6a";
    leaf.focus();
    leaf.addEventListener("blur", finishTextEdit, { once: true });
  }

  function finishTextEdit() {
    if (!editingEl) return;
    var el = editingEl;
    var oldText = (editingOld || "").trim();
    var newText = (el.textContent || "").trim();
    el.removeAttribute("contenteditable");
    el.style.outline = "";
    editingEl = null;
    editingOld = "";
    if (newText !== oldText) {
      var desc = describe(el);
      postEvent(
        { type: "edit-text", element: desc, oldText: oldText, newText: newText },
        desc
      );
    }
  }

  function onMouseMove(e) {
    if (mode === "browse") return;
    var el = targetAt(e);
    if (!el) {
      hoverEl = null;
      hideOutline();
      return;
    }
    hoverEl = el;
    if (mode === "comment") showOutline(el);
    else if (mode === "edit-style") showOutline(el, "style-mode");
    else if (mode === "edit-text") showOutline(textLeaf(el), "text-mode");
  }

  function onClick(e) {
    if (mode === "browse") return;
    var el = targetAt(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode === "comment") openCommentPanel(el, e.clientX, e.clientY);
    else if (mode === "edit-style") openStylePanel(el, e.clientX, e.clientY);
    else if (mode === "edit-text") beginTextEdit(el);
  }

  var INTERCEPT_BEFORE_ARTIFACT_HANDLERS = true;
  document.addEventListener("mousemove", onMouseMove, INTERCEPT_BEFORE_ARTIFACT_HANDLERS);
  document.addEventListener("click", onClick, INTERCEPT_BEFORE_ARTIFACT_HANDLERS);
  window.addEventListener(
    "scroll",
    function () {
      if (mode !== "browse" && hoverEl) {
        if (mode === "edit-text") showOutline(textLeaf(hoverEl), "text-mode");
        else showOutline(hoverEl, mode === "edit-style" ? "style-mode" : "");
      }
    },
    true
  );

  function setMode(next) {
    if (next === mode) return;
    finishTextEdit();
    removePanel();
    hideOutline();
    hoverEl = null;
    mode = next;
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.__cd !== true) return;
    if (d.cmd === "setMode" && typeof d.mode === "string") setMode(d.mode);
  });
})();

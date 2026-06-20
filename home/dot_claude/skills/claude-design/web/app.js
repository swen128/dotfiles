(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var projectId = (params.get("project") || "default").toLowerCase();

  var els = {
    title: document.getElementById("project-title"),
    modes: document.getElementById("modes"),
    tabs: document.getElementById("tabs"),
    iframe: document.getElementById("preview"),
    previewEmpty: document.getElementById("preview-empty"),
    comments: document.getElementById("comments"),
    commentCount: document.getElementById("comment-count"),
    panelEmpty: document.getElementById("panel-empty"),
    toast: document.getElementById("toast"),
    conn: document.getElementById("conn")
  };

  var state = {
    meta: null,
    activeFile: null,
    mode: "browse"
  };

  function api(path) {
    return fetch(path, { headers: { Accept: "application/json" } }).then(function (r) {
      if (!r.ok) throw new Error(path + " -> " + r.status);
      return r.json();
    });
  }

  function loadProject() {
    return api("/api/project/" + encodeURIComponent(projectId)).then(function (meta) {
      state.meta = meta;
      els.title.textContent = meta.title || projectId;
      document.title = (meta.title || projectId) + " — Claude Design";
      renderTabs();
      var files = meta.files || [];
      var preferred = meta.activeFile && files.indexOf(meta.activeFile) >= 0 ? meta.activeFile : files[0];
      setActiveFile(preferred || null);
    });
  }

  function renderTabs() {
    var files = (state.meta && state.meta.files) || [];
    els.tabs.textContent = "";
    files.forEach(function (file) {
      var tab = document.createElement("button");
      tab.className = "tab";
      tab.type = "button";
      tab.textContent = file;
      tab.dataset.file = file;
      if (file === state.activeFile) tab.classList.add("is-active");
      tab.addEventListener("click", function () { setActiveFile(file); });
      els.tabs.appendChild(tab);
    });
  }

  function setActiveFile(file) {
    state.activeFile = file;
    Array.prototype.forEach.call(els.tabs.children, function (tab) {
      tab.classList.toggle("is-active", tab.dataset.file === file);
    });
    if (!file) {
      els.iframe.src = "about:blank";
      els.previewEmpty.hidden = false;
      return;
    }
    els.previewEmpty.hidden = true;
    els.iframe.src = "/serve/" + encodeURIComponent(projectId) + "/" + file;
  }

  function reloadIframe() {
    if (!state.activeFile) return;
    var win = els.iframe.contentWindow;
    var scrollY = 0;
    try { scrollY = (win && win.scrollY) || 0; } catch (e) { scrollY = 0; }
    els.iframe.dataset.restoreScroll = String(scrollY);
    var base = "/serve/" + encodeURIComponent(projectId) + "/" + state.activeFile;
    els.iframe.src = base + "?_=" + Date.now();
  }

  els.iframe.addEventListener("load", function () {
    sendMode(state.mode);
    var restore = parseInt(els.iframe.dataset.restoreScroll || "0", 10);
    if (restore > 0) {
      try { els.iframe.contentWindow.scrollTo(0, restore); } catch (e) {}
      els.iframe.dataset.restoreScroll = "0";
    }
  });

  function sendMode(mode) {
    var win = els.iframe.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ __cd: true, cmd: "setMode", mode: mode }, "*");
    } catch (e) {}
  }

  els.modes.addEventListener("click", function (ev) {
    var btn = ev.target.closest(".mode-btn");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    Array.prototype.forEach.call(els.modes.children, function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    sendMode(state.mode);
  });

  function loadEvents() {
    return api("/api/events/" + encodeURIComponent(projectId)).then(function (events) {
      renderComments((events || []).filter(function (e) { return e && e.type === "comment"; }));
    }).catch(function () {});
  }

  function renderComments(comments) {
    els.comments.textContent = "";
    els.commentCount.textContent = String(comments.length);
    els.panelEmpty.style.display = comments.length ? "none" : "";
    comments.slice().reverse().forEach(function (c) {
      els.comments.appendChild(commentItem(c));
    });
  }

  function commentItem(c) {
    var el = c.element || {};
    var li = document.createElement("li");
    li.className = "comment";

    var meta = document.createElement("div");
    meta.className = "comment-meta";

    var tag = document.createElement("span");
    tag.className = "comment-tag";
    tag.textContent = el.tag || "?";
    meta.appendChild(tag);

    if (el.label) {
      var label = document.createElement("span");
      label.className = "comment-label";
      label.textContent = el.label;
      meta.appendChild(label);
    }

    var time = document.createElement("span");
    time.className = "comment-time";
    time.textContent = formatTime(c.ts);
    meta.appendChild(time);

    var text = document.createElement("p");
    text.className = "comment-text";
    text.textContent = c.comment || "";

    li.appendChild(meta);
    li.appendChild(text);

    var snippet = (el.text || "").trim();
    if (snippet) {
      var target = document.createElement("p");
      target.className = "comment-target";
      target.textContent = "“" + snippet + "”";
      li.appendChild(target);
    }
    return li;
  }

  function formatTime(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  var toastTimer = null;
  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    requestAnimationFrame(function () { els.toast.classList.add("is-visible"); });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("is-visible");
      setTimeout(function () { els.toast.hidden = true; }, 220);
    }, 1800);
  }

  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.__cd !== true) return;
    if (d.evt === "event-sent") {
      loadEvents();
      toast(toastLabel(d.type));
    }
  });

  function toastLabel(type) {
    if (type === "comment") return "Comment sent";
    if (type === "edit-text") return "Text edit applied";
    if (type === "edit-style") return "Style edit applied";
    return "Change sent";
  }

  function subscribeReload() {
    var src = new EventSource("/api/reload-stream?id=" + encodeURIComponent(projectId));
    src.onopen = function () { els.conn.classList.add("is-live"); };
    src.onmessage = function (ev) {
      if (ev.data === "reload") {
        loadProject().then(loadEvents).catch(function () {});
        reloadIframe();
      }
    };
    src.onerror = function () {
      els.conn.classList.remove("is-live");
    };
  }

  loadProject().then(loadEvents).then(subscribeReload).catch(function (err) {
    els.title.textContent = "Failed to load project";
    console.error(err);
  });
})();

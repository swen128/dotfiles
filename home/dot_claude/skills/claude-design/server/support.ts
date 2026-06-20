(function () {
  "use strict";

  if (!window.claude) {
    window.claude = {
      complete: async function () {
        return "[Claude API unavailable in local skill]";
      },
    };
  }

  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState(updaterOrObj) {
      const patch =
        typeof updaterOrObj === "function"
          ? updaterOrObj(this.state, this.props)
          : updaterOrObj;
      this.state = Object.assign({}, this.state, patch || {});
      this.forceUpdate();
    }
    forceUpdate() {
      if (typeof this.__cdRerender === "function") this.__cdRerender();
    }
    renderVals() {
      return {};
    }
    componentDidMount() {}
  }
  window.DCLogic = DCLogic;

  function currentDir() {
    const href = window.location.href.split("#")[0].split("?")[0];
    return href.slice(0, href.lastIndexOf("/") + 1);
  }

  function kebabToCamel(name) {
    return name.replace(/-([a-z0-9])/g, function (_, c) {
      return c.toUpperCase();
    });
  }

  function resolvePath(expr, scope) {
    const raw = expr.trim();
    if (raw === "") return { found: false, value: undefined };
    if (raw === "true") return { found: true, value: true };
    if (raw === "false") return { found: true, value: false };
    if (raw === "null") return { found: true, value: null };
    if (raw === "undefined") return { found: true, value: undefined };
    if (/^-?\d+(\.\d+)?$/.test(raw)) return { found: true, value: Number(raw) };
    if (
      (raw[0] === "'" && raw[raw.length - 1] === "'") ||
      (raw[0] === '"' && raw[raw.length - 1] === '"')
    ) {
      return { found: true, value: raw.slice(1, -1) };
    }
    const parts = raw.split(".");
    let cur = scope;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i].trim();
      if (cur == null || !(typeof cur === "object" || typeof cur === "function")) {
        return { found: false, value: undefined };
      }
      if (!(key in cur)) {
        if (Array.isArray(cur) && /^\d+$/.test(key)) {
          cur = cur[Number(key)];
          continue;
        }
        return { found: false, value: undefined };
      }
      cur = cur[key];
    }
    return { found: true, value: cur };
  }

  const WHOLE_HOLE = /^\s*\{\{([\s\S]+?)\}\}\s*$/;
  const ANY_HOLE = /\{\{([\s\S]+?)\}\}/g;

  function interpolateString(str, scope) {
    return str.replace(ANY_HOLE, function (_, expr) {
      const r = resolvePath(expr, scope);
      if (!r.found) {
        console.warn("[claude-design] unresolved hole:", expr.trim());
        return "";
      }
      if (r.value == null) return "";
      return String(r.value);
    });
  }

  function wholeHoleExpr(str) {
    const m = WHOLE_HOLE.exec(str);
    return m ? m[1] : null;
  }

  function eventNameFromAttr(attrName) {
    if (/^on[A-Z]/.test(attrName)) return attrName.slice(2).toLowerCase();
    return null;
  }

  const dcFileCache = new Map();
  const scriptCache = new Map();

  let _babelLoaded = null;
  function ensureBabel() {
    if (_babelLoaded) return _babelLoaded;
    _babelLoaded = new Promise(function (resolve) {
      if (window.Babel) return resolve(true);
      const s = document.createElement("script");
      s.src = "https://unpkg.com/@babel/standalone/babel.min.js";
      s.async = true;
      s.onload = function () {
        resolve(!!window.Babel);
      };
      s.onerror = function () {
        resolve(false);
      };
      document.head.appendChild(s);
      setTimeout(function () {
        resolve(!!window.Babel);
      }, 5000);
    });
    return _babelLoaded;
  }

  function makePlaceholder(hintSize) {
    const el = document.createElement("div");
    el.setAttribute("data-cd-placeholder", "");
    let w = "auto";
    let h = "auto";
    if (hintSize) {
      const parts = String(hintSize).split(",");
      if (parts[0]) w = withUnit(parts[0].trim());
      if (parts[1]) h = withUnit(parts[1].trim());
    }
    el.style.cssText =
      "display:block;width:" +
      w +
      ";height:" +
      h +
      ";background:repeating-linear-gradient(45deg,#f3f3f3,#f3f3f3 8px,#ececec 8px,#ececec 16px);" +
      "border:1px solid #e0e0e0;box-sizing:border-box;";
    return el;
  }
  function withUnit(v) {
    if (/^\d+$/.test(v)) return v + "px";
    return v;
  }

  function renderNodes(templateNodes, scope, ctx) {
    const out = [];
    for (let i = 0; i < templateNodes.length; i++) {
      renderOne(templateNodes[i], scope, ctx, out);
    }
    return out;
  }

  function renderOne(node, scope, ctx, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = node.nodeValue;
      if (txt.indexOf("{{") === -1) {
        out.push(document.createTextNode(txt));
      } else {
        out.push(document.createTextNode(interpolateString(txt, scope)));
      }
      return;
    }
    if (node.nodeType === Node.COMMENT_NODE) {
      out.push(document.createComment(node.nodeValue));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();

    if (tag === "helmet") return;
    if (tag === "sc-for" || (tag === "template" && node.hasAttribute("data-sc-for")))
      return renderScFor(node, scope, ctx, out);
    if (tag === "sc-if" || (tag === "template" && node.hasAttribute("data-sc-if")))
      return renderScIf(node, scope, ctx, out);
    if (tag === "dc-import") return renderDcImport(node, scope, ctx, out);
    if (tag === "x-import") return renderXImport(node, scope, ctx, out);

    const el = document.createElement(tag);
    applyAttributes(el, node, scope, ctx);
    const kids = renderNodes(Array.from(node.childNodes), scope, ctx);
    for (let k = 0; k < kids.length; k++) el.appendChild(kids[k]);
    out.push(el);
  }

  function applyAttributes(el, templateEl, scope, ctx) {
    const attrs = templateEl.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const name = attrs[i].name;
      const value = attrs[i].value;

      const evt = eventNameFromAttr(name);
      if (evt) {
        const expr = wholeHoleExpr(value);
        if (expr) {
          const r = resolvePath(expr, scope);
          if (r.found && typeof r.value === "function") {
            el.addEventListener(evt, r.value);
          } else if (!r.found) {
            console.warn("[claude-design] unresolved handler:", expr.trim());
          }
        }
        continue;
      }

      const whole = wholeHoleExpr(value);
      if (whole !== null) {
        const r = resolvePath(whole, scope);
        if (!r.found) {
          console.warn("[claude-design] unresolved attr hole:", whole.trim());
          continue;
        }
        const v = r.value;
        if (v == null || v === false) continue;
        if (v === true) {
          el.setAttribute(name, "");
          continue;
        }
        if (typeof v === "function" || typeof v === "object") {
          try {
            el[name] = v;
          } catch (e) {}
          continue;
        }
        el.setAttribute(name, String(v));
        continue;
      }

      if (value.indexOf("{{") !== -1) {
        el.setAttribute(name, interpolateString(value, scope));
      } else {
        el.setAttribute(name, value);
      }
    }
  }

  function renderScFor(node, scope, ctx, out) {
    const listAttr = node.getAttribute("list") || "";
    const asName = node.getAttribute("as") || "item";
    const placeholderCount = parseInt(
      node.getAttribute("hint-placeholder-count") || "0",
      10
    );
    const childTemplates = controlBody(node);

    const expr = wholeHoleExpr(listAttr) || listAttr;
    const r = resolvePath(expr, scope);

    if (!r.found || r.value === undefined) {
      for (let p = 0; p < (placeholderCount || 0); p++) {
        const childScope = Object.assign({}, scope);
        childScope[asName] = undefined;
        childScope.$index = p;
        const rendered = renderNodes(childTemplates, childScope, ctx);
        for (let k = 0; k < rendered.length; k++) out.push(rendered[k]);
      }
      return;
    }

    const list = r.value || [];
    if (!Array.isArray(list)) {
      console.warn("[claude-design] sc-for list is not an array:", expr.trim());
      return;
    }
    for (let idx = 0; idx < list.length; idx++) {
      const childScope = Object.assign({}, scope);
      childScope[asName] = list[idx];
      childScope.$index = idx;
      const rendered = renderNodes(childTemplates, childScope, ctx);
      for (let k = 0; k < rendered.length; k++) out.push(rendered[k]);
    }
  }

  function renderScIf(node, scope, ctx, out) {
    const valueAttr = node.getAttribute("value") || "";
    const childTemplates = controlBody(node);

    const expr = wholeHoleExpr(valueAttr) || valueAttr;
    const r = resolvePath(expr, scope);

    let cond;
    if (!r.found || r.value === undefined) {
      const hintAttr = node.getAttribute("hint-placeholder-val");
      if (hintAttr != null) {
        const hExpr = wholeHoleExpr(hintAttr) || hintAttr;
        const hr = resolvePath(hExpr, scope);
        cond = hr.found ? hr.value : false;
      } else {
        cond = false;
      }
    } else {
      cond = r.value;
    }

    if (cond) {
      const rendered = renderNodes(childTemplates, scope, ctx);
      for (let k = 0; k < rendered.length; k++) out.push(rendered[k]);
    }
  }

  function renderDcImport(node, scope, ctx, out) {
    const name = node.getAttribute("name");
    const hintSize = node.getAttribute("hint-size");
    const placeholder = makePlaceholder(hintSize);
    out.push(placeholder);

    if (!name) {
      console.warn("[claude-design] <dc-import> missing name");
      return;
    }

    const props = {};
    const attrs = node.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const aName = attrs[i].name;
      if (aName === "name" || aName === "hint-size") continue;
      const aVal = attrs[i].value;
      const whole = wholeHoleExpr(aVal);
      const propName = kebabToCamel(aName);
      if (whole !== null) {
        const r = resolvePath(whole, scope);
        props[propName] = r.found ? r.value : undefined;
      } else if (aVal.indexOf("{{") !== -1) {
        props[propName] = interpolateString(aVal, scope);
      } else {
        props[propName] = aVal;
      }
    }
    const childTemplates = Array.from(node.childNodes);
    props.children = renderNodes(childTemplates, scope, ctx);

    const url = currentDir() + name + ".dc.html";
    loadDcFile(url)
      .then(function (mod) {
        const frag = renderComponent(mod, props, ctx);
        replacePlaceholder(placeholder, frag);
      })
      .catch(function (err) {
        console.warn("[claude-design] dc-import failed:", name, err);
      });
  }

  function loadDcFile(url) {
    if (dcFileCache.has(url)) return dcFileCache.get(url);
    const p = fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
        return res.text();
      })
      .then(function (html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const xdc = doc.querySelector("x-dc");
        const raw = extractXdcRaw(html);
        const templateHTML = raw != null ? raw : xdc ? xdc.innerHTML : "";
        const logicScript = doc.querySelector('script[type="dc-logic"]');
        let Component = null;
        if (logicScript && logicScript.textContent.trim()) {
          Component = evalComponent(logicScript.textContent);
        }
        if (xdc) hoistHelmet(xdc);
        return { templateHTML: templateHTML, Component: Component };
      });
    dcFileCache.set(url, p);
    return p;
  }

  function renderXImport(node, scope, ctx, out) {
    const hintSize = node.getAttribute("hint-size");
    const fromAttr = node.getAttribute("from");
    const compName = node.getAttribute("component");
    const globalName = node.getAttribute("component-from-global-scope");
    const placeholder = makePlaceholder(hintSize);
    out.push(placeholder);

    if (!fromAttr) {
      console.warn("[claude-design] <x-import> missing from");
      return;
    }
    const url = absoluteUrl(fromAttr);
    const collected = collectImportAttrs(node, scope, ctx);

    if (globalName) {
      loadScript(url)
        .then(function () {
          mountGlobal(globalName, collected, placeholder);
        })
        .catch(function (err) {
          console.warn("[claude-design] x-import (global) failed:", url, err);
        });
      return;
    }

    if (compName) {
      const isJsx = /\.jsx($|\?)/.test(fromAttr);
      loadModuleComponent(url, compName, isJsx)
        .then(function (factory) {
          if (!factory) {
            console.warn(
              "[claude-design] x-import component unavailable:",
              compName
            );
            return;
          }
          mountFactory(factory, collected.props, placeholder);
        })
        .catch(function (err) {
          console.warn("[claude-design] x-import failed:", compName, err);
        });
      return;
    }

    console.warn(
      "[claude-design] <x-import> needs component or component-from-global-scope"
    );
  }

  function collectImportAttrs(node, scope, ctx) {
    const SKIP = {
      from: 1,
      component: 1,
      "component-from-global-scope": 1,
      "hint-size": 1,
    };
    const attrs = {};
    const props = {};
    const list = node.attributes;
    for (let i = 0; i < list.length; i++) {
      const name = list[i].name;
      if (SKIP[name]) continue;
      const val = list[i].value;
      const whole = wholeHoleExpr(val);
      let resolved;
      if (whole !== null) {
        const r = resolvePath(whole, scope);
        resolved = r.found ? r.value : undefined;
      } else if (val.indexOf("{{") !== -1) {
        resolved = interpolateString(val, scope);
      } else {
        resolved = val;
      }
      if (
        resolved != null &&
        typeof resolved !== "object" &&
        typeof resolved !== "function"
      ) {
        attrs[name] = String(resolved);
      }
      props[kebabToCamel(name)] = resolved;
    }
    const children = Array.from(node.childNodes);
    props.children = renderNodes(children, scope, ctx);
    return { attrs: attrs, props: props, childTemplates: children };
  }

  function absoluteUrl(from) {
    if (/^https?:\/\//.test(from)) return from;
    return new URL(from, currentDir()).href;
  }

  function loadScript(url) {
    if (scriptCache.has(url)) return scriptCache.get(url);
    const p = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("failed to load " + url));
      };
      document.head.appendChild(s);
    });
    scriptCache.set(url, p);
    return p;
  }

  function mountGlobal(globalName, collected, placeholder) {
    if (
      typeof customElements !== "undefined" &&
      globalName.indexOf(".") === -1 &&
      customElements.get(globalName)
    ) {
      const el = document.createElement(globalName);
      for (const k in collected.attrs) el.setAttribute(k, collected.attrs[k]);
      for (let i = 0; i < collected.props.children.length; i++) {
        el.appendChild(collected.props.children[i]);
      }
      replacePlaceholder(placeholder, [el]);
      return;
    }
    const g = resolveGlobal(globalName);
    if (g === undefined) {
      console.warn("[claude-design] global not found:", globalName);
      return;
    }
    mountFactory(g, collected.props, placeholder);
  }

  function resolveGlobal(dotted) {
    const parts = dotted.split(".");
    let cur = window;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function loadModuleComponent(url, compName, isJsx) {
    if (isJsx) {
      return ensureBabel().then(function (ok) {
        if (!ok) {
          console.warn(
            "[claude-design] Babel unavailable (offline) — cannot transpile JSX:",
            url
          );
          return null;
        }
        return fetch(url)
          .then(function (r) {
            return r.text();
          })
          .then(function (src) {
            const transpiled = window.Babel.transform(src, {
              presets: ["react"],
            }).code;
            return evalModuleComponent(transpiled, compName);
          });
      });
    }
    return fetch(url)
      .then(function (r) {
        return r.text();
      })
      .then(function (src) {
        return evalModuleComponent(src, compName);
      });
  }

  function evalModuleComponent(src, compName) {
    const exportsObj = {};
    let code = src
      .replace(/export\s+default\s+/g, "__exports__.default = ")
      .replace(/export\s+(const|let|var|function|class)\s+/g, "$1 ");
    code +=
      "\n;try{ if(typeof " +
      compName +
      " !== 'undefined') __exports__[" +
      JSON.stringify(compName) +
      "] = " +
      compName +
      "; }catch(e){}";
    try {
      const fn = new Function("__exports__", "React", "window", code);
      fn(exportsObj, window.React, window);
    } catch (e) {
      console.warn("[claude-design] failed to eval module:", e);
      return null;
    }
    return exportsObj[compName] || exportsObj.default || null;
  }

  function mountFactory(factory, props, placeholder) {
    if (typeof factory === "function" && factory.prototype instanceof DCLogic) {
      const frag = renderComponent(
        { Component: factory, templateHTML: "" },
        props,
        { dir: currentDir() }
      );
      replacePlaceholder(placeholder, frag);
      return;
    }
    if (window.React && window.ReactDOM && typeof factory === "function") {
      const mount = document.createElement("div");
      replacePlaceholder(placeholder, [mount]);
      try {
        const element = window.React.createElement(factory, props || {});
        if (window.ReactDOM.createRoot) {
          window.ReactDOM.createRoot(mount).render(element);
        } else {
          window.ReactDOM.render(element, mount);
        }
      } catch (e) {
        console.warn("[claude-design] React render failed:", e);
      }
      return;
    }
    if (typeof factory === "function") {
      let result;
      try {
        result = factory(props || {});
      } catch (e) {
        console.warn("[claude-design] factory threw:", e);
        return;
      }
      mountResult(result, placeholder);
      return;
    }
    mountResult(factory, placeholder);
  }

  function mountResult(result, placeholder) {
    if (result == null) return;
    if (result instanceof Node) {
      replacePlaceholder(placeholder, [result]);
    } else if (typeof result === "string") {
      const tmp = document.createElement("div");
      tmp.innerHTML = result;
      replacePlaceholder(placeholder, Array.from(tmp.childNodes));
    } else {
      console.warn("[claude-design] unsupported factory result:", result);
    }
  }

  function replacePlaceholder(placeholder, nodes) {
    if (!placeholder.parentNode) return;
    for (let k = 0; k < nodes.length; k++) {
      placeholder.parentNode.insertBefore(nodes[k], placeholder);
    }
    placeholder.parentNode.removeChild(placeholder);
  }

  function renderComponent(mod, props, ctx) {
    const Component = mod.Component || DefaultComponent;
    const instance = new Component(props || {});
    if (!instance.props) instance.props = props || {};
    if (!instance.state) instance.state = {};

    const wrapper = document.createElement("dc-component");
    wrapper.style.display = "contents";

    const templateNodes = parseTemplate(mod.templateHTML);

    let mounted = false;
    function build() {
      while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
      const vals = Object.assign(
        {},
        instance.props,
        typeof instance.renderVals === "function" ? instance.renderVals() : {}
      );
      vals.state = instance.state;
      vals.props = instance.props;
      for (const k in instance.state) {
        if (!(k in vals)) vals[k] = instance.state[k];
      }
      const nodes = renderNodes(
        templateNodes,
        vals,
        ctx || { dir: currentDir() }
      );
      for (let i = 0; i < nodes.length; i++) wrapper.appendChild(nodes[i]);

      if (!mounted) {
        mounted = true;
        if (typeof instance.componentDidMount === "function") {
          Promise.resolve().then(function () {
            try {
              instance.componentDidMount();
            } catch (e) {
              console.warn("[claude-design] componentDidMount error:", e);
            }
          });
        }
      }
    }

    instance.__cdRerender = build;
    build();
    return [wrapper];
  }

  class DefaultComponent extends DCLogic {}

  function protectControlTags(html) {
    return html
      .replace(/<sc-for(\s|>)/gi, "<template data-sc-for$1")
      .replace(/<\/sc-for\s*>/gi, "</template>")
      .replace(/<sc-if(\s|>)/gi, "<template data-sc-if$1")
      .replace(/<\/sc-if\s*>/gi, "</template>");
  }

  function extractXdcRaw(htmlText) {
    const m = htmlText.match(/<x-dc[^>]*>([\s\S]*)<\/x-dc>/i);
    if (!m) return null;
    return m[1].replace(/<helmet[\s\S]*?<\/helmet>/i, "");
  }

  function parseTemplate(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = protectControlTags(html);
    return Array.from(tpl.content.childNodes);
  }

  function controlBody(node) {
    return node.tagName === "TEMPLATE"
      ? Array.from(node.content.childNodes)
      : Array.from(node.childNodes);
  }

  function evalComponent(src) {
    try {
      const code =
        src +
        "\n;return (typeof Component !== 'undefined') ? Component : " +
        "(typeof exports !== 'undefined' && exports.default) ? exports.default : null;";
      const fn = new Function("DCLogic", "React", "window", "exports", code);
      const exportsObj = {};
      const Comp = fn(DCLogic, window.React, window, exportsObj);
      return Comp || exportsObj.default || null;
    } catch (e) {
      console.warn("[claude-design] failed to evaluate dc-logic:", e);
      return null;
    }
  }

  function hoistHelmet(scopeEl) {
    const helmets = scopeEl.querySelectorAll("helmet");
    for (let i = 0; i < helmets.length; i++) {
      const helmet = helmets[i];
      const kids = Array.from(helmet.childNodes);
      for (let j = 0; j < kids.length; j++) {
        const kid = kids[j];
        if (
          kid.nodeType === Node.ELEMENT_NODE &&
          kid.tagName.toLowerCase() === "script"
        ) {
          const s = document.createElement("script");
          for (let a = 0; a < kid.attributes.length; a++) {
            s.setAttribute(kid.attributes[a].name, kid.attributes[a].value);
          }
          s.textContent = kid.textContent;
          document.head.appendChild(s);
        } else {
          document.head.appendChild(kid.cloneNode(true));
        }
      }
      helmet.parentNode && helmet.parentNode.removeChild(helmet);
    }
  }

  function renderInto(xdc, templateHTML) {
    const logicScript = document.querySelector('script[type="dc-logic"]');
    let Component = null;
    let props = {};
    if (logicScript) {
      const dp = logicScript.getAttribute("data-props");
      if (dp) {
        try {
          props = JSON.parse(dp);
        } catch (e) {
          console.warn("[claude-design] invalid data-props JSON:", e);
        }
      }
      if (logicScript.textContent.trim()) {
        Component = evalComponent(logicScript.textContent);
      }
    }

    const mod = { Component: Component, templateHTML: templateHTML };
    const nodes = renderComponent(mod, props, { dir: currentDir() });
    const parent = xdc.parentNode;
    for (const node of nodes) parent.insertBefore(node, xdc);
    parent.removeChild(xdc);
  }

  function boot() {
    const xdc = document.querySelector("x-dc");
    if (!xdc) return;
    hoistHelmet(xdc);
    fetch(location.href)
      .then(function (r) { return r.text(); })
      .then(function (text) {
        const raw = extractXdcRaw(text);
        renderInto(xdc, raw != null ? raw : xdc.innerHTML);
      })
      .catch(function () { renderInto(xdc, xdc.innerHTML); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

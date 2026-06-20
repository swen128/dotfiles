import { mkdirSync, existsSync, readdirSync, statSync, watch as fsWatch } from "node:fs";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DATA_DIR = path.join(os.homedir(), ".claude-design");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");

const SERVER_DIR = import.meta.dir;
const SKILL_ROOT = path.resolve(SERVER_DIR, "..");
const WEB_DIR = path.join(SKILL_ROOT, "web");

const DEFAULT_PORT = 4321;

const NON_ARTIFACT_FILES = new Set(["meta.json", "inbox.jsonl", "comments.jsonl"]);

function slugify(id?: string | null): string {
  const s = (id ?? "").toString().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "default";
}

export function projectDir(id: string): string {
  return path.join(PROJECTS_DIR, slugify(id));
}

function metaPath(id: string): string {
  return path.join(projectDir(id), "meta.json");
}

function listArtifacts(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => !NON_ARTIFACT_FILES.has(f))
      .filter((f) => {
        try {
          return statSync(path.join(dir, f)).isFile();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

interface ProjectMeta {
  id: string;
  title: string;
  files: string[];
  activeFile: string;
  createdAt: string;
  updatedAt: string;
}

export async function ensureProject(id: string, title?: string): Promise<ProjectMeta> {
  const slug = slugify(id);
  const dir = projectDir(slug);
  mkdirSync(dir, { recursive: true });

  const now = new Date().toISOString();
  let meta: ProjectMeta;
  const mp = metaPath(slug);

  if (existsSync(mp)) {
    try {
      meta = JSON.parse(await readFile(mp, "utf8")) as ProjectMeta;
    } catch {
      meta = { id: slug, title: title ?? slug, files: [], activeFile: "", createdAt: now, updatedAt: now };
    }
  } else {
    meta = { id: slug, title: title ?? slug, files: [], activeFile: "", createdAt: now, updatedAt: now };
  }

  const files = listArtifacts(dir);
  const before = JSON.stringify({ ...meta, updatedAt: 0 });
  meta.id = slug;
  if (title) meta.title = title;
  if (!meta.title) meta.title = slug;
  meta.files = files;
  if (!meta.activeFile || !files.includes(meta.activeFile)) {
    meta.activeFile = files[0] ?? "";
  }
  if (!meta.createdAt) meta.createdAt = now;

  const after = JSON.stringify({ ...meta, updatedAt: 0 });
  if (!existsSync(mp) || before !== after) {
    meta.updatedAt = now;
    try {
      await writeFile(mp, JSON.stringify(meta, null, 2));
    } catch {}
  }
  return meta;
}

function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".jsx":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    default:
      return "application/octet-stream";
  }
}

async function serveFile(absPath: string, contentType?: string): Promise<Response> {
  try {
    const f = Bun.file(absPath);
    if (!(await f.exists())) return new Response("Not found", { status: 404 });
    return new Response(f, { headers: { "Content-Type": contentType ?? contentTypeFor(absPath) } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

const tsTranspiler = new Bun.Transpiler({ loader: "ts" });

async function serveScript(absTsPath: string): Promise<Response> {
  const f = Bun.file(absTsPath);
  if (!(await f.exists())) return new Response("Not found", { status: 404 });
  const js = tsTranspiler.transformSync(await f.text());
  return new Response(js, {
    headers: { "Content-Type": "application/javascript; charset=utf-8" },
  });
}

function isInjectableHtml(p: string): boolean {
  const lp = p.toLowerCase();
  return lp.endsWith(".html") || lp.endsWith(".dc.html");
}

const AGENT_SCRIPT_TAG = '\n<script src="/preview-agent.js"></script>';

function injectAgent(html: string): string {
  if (html.includes('src="/preview-agent.js"')) return html;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return html + AGENT_SCRIPT_TAG;
  return html.slice(0, idx) + AGENT_SCRIPT_TAG + "\n" + html.slice(idx);
}

const OVERRIDE_STYLE_ID = "__om-edit-overrides";

async function applyEditText(absFile: string, oldText: string, newText: string): Promise<void> {
  try {
    if (!(await Bun.file(absFile).exists())) return;
    const src = await readFile(absFile, "utf8");
    const idx = src.indexOf(oldText);
    if (idx === -1) return;
    const next = src.slice(0, idx) + newText + src.slice(idx + oldText.length);
    if (next !== src) await writeFile(absFile, next);
  } catch {}
}

async function applyEditStyle(
  absFile: string,
  selector: string,
  property: string,
  newValue: string,
): Promise<void> {
  try {
    if (!(await Bun.file(absFile).exists())) return;
    if (!selector || !property) return;
    let src = await readFile(absFile, "utf8");
    const rule = `${selector} { ${property}: ${newValue} !important; }`;

    const styleOpenRe = new RegExp(`<style\\s+id=["']${OVERRIDE_STYLE_ID}["'][^>]*>`, "i");
    const openMatch = styleOpenRe.exec(src);

    if (openMatch) {
      const blockStart = openMatch.index + openMatch[0].length;
      const closeIdx = src.toLowerCase().indexOf("</style>", blockStart);
      if (closeIdx === -1) {
        src = insertOverrideBlock(src, rule);
      } else {
        const body = src.slice(blockStart, closeIdx);
        const newBody = upsertRule(body, selector, property, newValue);
        src = src.slice(0, blockStart) + newBody + src.slice(closeIdx);
      }
    } else {
      src = insertOverrideBlock(src, rule);
    }
    await writeFile(absFile, src);
  } catch {}
}

function upsertRule(body: string, selector: string, property: string, newValue: string): string {
  const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escProp = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineRe = new RegExp(`\\n?\\s*${escSel}\\s*\\{\\s*${escProp}\\s*:[^}]*\\}`, "i");
  const replacement = `\n${selector} { ${property}: ${newValue} !important; }`;
  if (lineRe.test(body)) {
    return body.replace(lineRe, replacement);
  }
  return body + replacement;
}

function insertOverrideBlock(src: string, rule: string): string {
  const block = `<style id="${OVERRIDE_STYLE_ID}">\n${rule}\n</style>`;
  const headCloseIdx = src.toLowerCase().indexOf("</head>");
  if (headCloseIdx !== -1) {
    return src.slice(0, headCloseIdx) + block + "\n" + src.slice(headCloseIdx);
  }
  const bodyOpenIdx = src.toLowerCase().indexOf("<body");
  if (bodyOpenIdx !== -1) {
    return src.slice(0, bodyOpenIdx) + block + "\n" + src.slice(bodyOpenIdx);
  }
  return block + "\n" + src;
}

interface EventBody {
  type?: string;
  projectId?: string;
  file?: string;
  element?: { tag?: string; path?: string; label?: string | null; text?: string };
  comment?: string;
  oldText?: string;
  newText?: string;
  property?: string;
  oldValue?: string;
  newValue?: string;
  [k: string]: unknown;
}

async function handleEvent(body: EventBody, idFromQuery: string | null): Promise<boolean> {
  if (!body || typeof body !== "object") return false;
  const type = body.type;
  if (type !== "comment" && type !== "edit-text" && type !== "edit-style") return false;

  const id = slugify(body.projectId || idFromQuery || "default");
  const dir = projectDir(id);
  mkdirSync(dir, { recursive: true });

  const event = { ...body, ts: new Date().toISOString(), projectId: id };

  const line = JSON.stringify(event) + "\n";
  try {
    await appendFile(path.join(dir, "inbox.jsonl"), line);
    if (type === "comment") await appendFile(path.join(dir, "comments.jsonl"), line);
  } catch {}

  const file = typeof body.file === "string" ? path.basename(body.file) : "";
  if (file) {
    const absFile = path.join(dir, file);
    if (type === "edit-text" && typeof body.oldText === "string" && typeof body.newText === "string") {
      await applyEditText(absFile, body.oldText, body.newText);
    } else if (type === "edit-style") {
      const selector = body.element?.path ?? "";
      const property = body.property ?? "";
      const newValue = body.newValue ?? "";
      if (selector && property) await applyEditStyle(absFile, selector, property, newValue);
    }
  }
  return true;
}

async function readEvents(id: string): Promise<unknown[]> {
  try {
    const p = path.join(projectDir(id), "inbox.jsonl");
    if (!(await Bun.file(p).exists())) return [];
    const text = await readFile(p, "utf8");
    const out: unknown[] = [];
    for (const ln of text.split("\n")) {
      const t = ln.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

function reloadStream(id: string): Response {
  const dir = projectDir(id);
  mkdirSync(dir, { recursive: true });
  const encoder = new TextEncoder();
  let watcher: ReturnType<typeof fsWatch> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (msg: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
        } catch {}
      };
      send("hello");
      try {
        watcher = fsWatch(dir, { recursive: true }, (_evt, filename) => {
          if (filename && NON_ARTIFACT_FILES.has(path.basename(String(filename)))) return;
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => send("reload"), 120);
        });
      } catch {}
    },
    cancel() {
      if (debounce) clearTimeout(debounce);
      try {
        watcher?.close();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/" || pathname === "/index.html") {
    return serveFile(path.join(WEB_DIR, "index.html"), "text/html; charset=utf-8");
  }
  if (pathname === "/assets/app.js") {
    return serveFile(path.join(WEB_DIR, "app.js"), "application/javascript; charset=utf-8");
  }
  if (pathname === "/assets/style.css") {
    return serveFile(path.join(WEB_DIR, "style.css"), "text/css; charset=utf-8");
  }
  if (pathname === "/preview-agent.js") {
    return serveScript(path.join(SERVER_DIR, "preview-agent.ts"));
  }
  if (pathname === "/support.js") {
    return serveScript(path.join(SERVER_DIR, "support.ts"));
  }

  let m: RegExpMatchArray | null;
  if ((m = pathname.match(/^\/api\/project\/([^/]+)$/))) {
    const meta = await ensureProject(m[1]);
    return jsonResponse(meta);
  }

  if ((m = pathname.match(/^\/api\/events\/([^/]+)$/))) {
    const events = await readEvents(slugify(m[1]));
    return jsonResponse(events);
  }

  if (pathname === "/api/event" && req.method === "POST") {
    let body: EventBody | null = null;
    try {
      body = (await req.json()) as EventBody;
    } catch {
      return jsonResponse({ ok: false }, 400);
    }
    const ok = await handleEvent(body, url.searchParams.get("id"));
    return ok ? jsonResponse({ ok: true }) : jsonResponse({ ok: false }, 400);
  }

  if (pathname === "/api/reload-stream") {
    const id = slugify(url.searchParams.get("id"));
    return reloadStream(id);
  }

  if ((m = pathname.match(/^\/serve\/([^/]+)\/(.*)$/))) {
    const id = slugify(m[1]);
    const rel = m[2];
    return serveProjectFile(id, rel);
  }

  return new Response("Not found", { status: 404 });
}

async function serveProjectFile(id: string, rel: string): Promise<Response> {
  const dir = projectDir(id);

  if (rel === "support.js" || rel.endsWith("/support.js")) {
    return serveScript(path.join(SERVER_DIR, "support.ts"));
  }

  const target = path.resolve(dir, rel);
  if (target !== dir && !target.startsWith(dir + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const f = Bun.file(target);
    if (!(await f.exists())) return new Response("Not found", { status: 404 });

    if (isInjectableHtml(target)) {
      const html = await readFile(target, "utf8");
      return new Response(injectAgent(html), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return new Response(f, { headers: { "Content-Type": contentTypeFor(target) } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export interface StartedServer {
  port: number;
  url: string;
  stop: () => void;
}

export async function startServer({ port }: { port?: number } = {}): Promise<StartedServer> {
  mkdirSync(PROJECTS_DIR, { recursive: true });

  let tryPort = port ?? DEFAULT_PORT;
  const maxAttempts = 100;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const server = Bun.serve({
        port: tryPort,
        idleTimeout: 0,
        fetch: (req) =>
          handleRequest(req).catch(() => new Response("Internal error", { status: 500 })),
      });
      const actualPort = server.port ?? tryPort;
      return {
        port: actualPort,
        url: `http://localhost:${actualPort}`,
        stop: () => server.stop(true),
      };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const msg = (err as { message?: string })?.message ?? "";
      if (code === "EADDRINUSE" || /in use|EADDRINUSE/i.test(msg)) {
        tryPort += 1;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not find a free port starting at ${port ?? DEFAULT_PORT}`);
}

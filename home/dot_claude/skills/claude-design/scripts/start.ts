#!/usr/bin/env bun
import { existsSync, statSync, watch } from "fs";
import { startServer, ensureProject, projectDir } from "../server/server.ts";

function parseArgs(argv: string[]): { projectId: string; title?: string } {
  const args = argv.slice(2);
  let projectId: string | undefined;
  let title: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--title") {
      title = args[++i];
    } else if (a.startsWith("--title=")) {
      title = a.slice("--title=".length);
    } else if (!projectId && !a.startsWith("-")) {
      projectId = a;
    }
  }

  return { projectId: projectId ?? "default", title };
}

function formatTime(ts?: string): string {
  const d = ts ? new Date(ts) : new Date();
  const valid = !Number.isNaN(d.getTime()) ? d : new Date();
  const hh = String(valid.getHours()).padStart(2, "0");
  const mm = String(valid.getMinutes()).padStart(2, "0");
  const ss = String(valid.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function describeElement(element: any): string {
  if (!element || typeof element !== "object") return "";
  const tag = element.tag ? `<${element.tag}>` : "<?>";
  const text =
    typeof element.text === "string" && element.text.length > 0
      ? ` "${element.text}"`
      : "";
  const label = element.label ? ` (${element.label})` : "";
  return `${tag}${text}${label}`;
}

function formatEvent(evt: any): string {
  const time = formatTime(evt?.ts);
  const el = describeElement(evt?.element);
  const file = evt?.file ? ` in ${evt.file}` : "";
  const tail = `${el ? ` — ${el}` : ""}${file}`;

  switch (evt?.type) {
    case "comment":
      return `[comment ${time}] "${evt?.comment ?? ""}"${tail}`;
    case "edit-text":
      return `[edit-text ${time}] "${evt?.oldText ?? ""}" → "${evt?.newText ?? ""}"${tail}`;
    case "edit-style":
      return `[edit-style ${time}] ${evt?.property ?? "?"}: ${evt?.oldValue ?? ""} → ${evt?.newValue ?? ""}${tail}`;
    default:
      return `[${evt?.type ?? "event"} ${time}]${tail}`;
  }
}

function printLine(line: string): void {
  Bun.write(Bun.stdout, line + "\n");
}

function makeTailer(inboxPath: string) {
  let consumedBytes = 0;
  let pendingLine = "";
  let reading = false;

  async function pump(): Promise<void> {
    if (reading) return;
    reading = true;
    try {
      if (!existsSync(inboxPath)) return;

      let size = 0;
      try {
        size = statSync(inboxPath).size;
      } catch {
        return;
      }

      const wasTruncatedOrRotated = size < consumedBytes;
      if (wasTruncatedOrRotated) {
        consumedBytes = 0;
        pendingLine = "";
      }
      if (size === consumedBytes) return;

      const chunk = await Bun.file(inboxPath).slice(consumedBytes, size).text();
      consumedBytes = size;

      pendingLine += chunk;
      const parts = pendingLine.split("\n");
      pendingLine = parts.pop() ?? "";

      for (const raw of parts) {
        const line = raw.trim();
        if (!line) continue;
        try {
          printLine(formatEvent(JSON.parse(line)));
        } catch {
          printLine(`[raw] ${line}`);
        }
      }
    } finally {
      reading = false;
    }
  }

  return pump;
}

async function main(): Promise<void> {
  const { projectId, title } = parseArgs(process.argv);

  ensureProject(projectId, title);

  const { port } = await startServer();
  const url = `http://localhost:${port}/?project=${projectId}`;
  const dir = projectDir(projectId);

  printLine("Claude Design ready: " + url);
  printLine("Projects dir: " + dir);

  if (process.platform === "darwin") {
    try {
      Bun.spawn(["open", url]);
    } catch {}
  }

  const inboxPath = `${dir}/inbox.jsonl`;
  const pump = makeTailer(inboxPath);

  await pump();

  setInterval(() => {
    void pump();
  }, 500);

  try {
    watch(dir, { persistent: true }, (_event, filename) => {
      if (!filename || filename === "inbox.jsonl") {
        void pump();
      }
    });
  } catch {}

  await new Promise<void>(() => {});
}

main().catch((err) => {
  printLine("[fatal] " + (err?.stack || err?.message || String(err)));
  process.exitCode = 1;
});

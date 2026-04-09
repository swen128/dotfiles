#!/usr/bin/env bun
export {};

const API = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";
const BETA_BYOC = "ccr-byoc-2025-07-29";
const WEB_BASE = "https://claude.ai/code";
const DEFAULT_MODEL = "claude-opus-4-6[1m]";
const POLL_INTERVAL_MS = 3000;

function toCse(id: string): string {
  if (id.startsWith("cse_")) return id;
  if (id.startsWith("session_")) return "cse_" + id.slice(8);
  return "cse_" + id;
}

function toSession(id: string): string {
  if (id.startsWith("session_")) return id;
  if (id.startsWith("cse_")) return "session_" + id.slice(4);
  return "session_" + id;
}

async function getToken(): Promise<string> {
  const proc = Bun.spawn(
    [
      "security",
      "find-generic-password",
      "-s",
      "Claude Code-credentials",
      "-a",
      process.env.USER || "unknown",
      "-w",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const raw = await new Response(proc.stdout).text();
  await proc.exited;
  const creds = JSON.parse(raw.trim());
  return creds.claudeAiOauth.accessToken;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  beta?: string;
}

async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const { method = "GET", body, beta } = opts;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getToken()}`,
    "anthropic-version": API_VERSION,
  };
  if (beta) headers["anthropic-beta"] = beta;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

async function readPrompt(args: string[]): Promise<string> {
  if (args.length > 0) return args.join(" ");

  if (Bun.stdin.stream) {
    const chunks: string[] = [];
    const reader = Bun.stdin.stream().getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    const result = chunks.join("").trim();
    if (result) return result;
  }

  console.error("Error: no prompt provided. Pass as argument or pipe via stdin.");
  process.exit(1);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toISOString().split("T")[0];
}

function pad(s: string, n: number): string {
  const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
  if (visible.length >= n) return s.slice(0, n + (s.length - visible.length));
  return s + " ".repeat(n - visible.length);
}

function statusIcon(s: { connection_status: string; worker_status: string; status: string }): string {
  if (s.connection_status === "connected") return "\x1b[32m●\x1b[0m";
  if (s.worker_status === "requires_action") return "\x1b[33m◉\x1b[0m";
  if (s.status === "archived") return "\x1b[90m○\x1b[0m";
  return "\x1b[90m●\x1b[0m";
}

function modelShort(model?: string): string {
  if (!model) return "?";
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model.slice(0, 10);
}

function repoName(sources: { url?: string }[]): string {
  for (const src of sources || []) {
    if (src.url) {
      const match = src.url.match(/([^/]+\/[^/]+?)(?:\.git)?$/);
      if (match) return match[1];
    }
  }
  return "-";
}

function branchName(outcomes: { git_info?: { branches: string[] } }[]): string {
  for (const out of outcomes || []) {
    if (out.git_info?.branches?.length) return out.git_info.branches[0];
  }
  return "-";
}

function sendEvent(sessionId: string, prompt: string) {
  return api(`code/sessions/${sessionId}/events`, {
    method: "POST",
    beta: BETA_BYOC,
    body: {
      events: [
        {
          type: "user",
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          parent_tool_use_id: null,
          message: { role: "user", content: prompt },
        },
      ],
    },
  });
}

async function cmdSpawn(args: string[]): Promise<void> {
  let model = DEFAULT_MODEL;
  let envId: string | undefined;
  const promptArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) {
      const m = args[++i];
      if (m === "sonnet") model = "claude-sonnet-4-6";
      else if (m === "haiku") model = "claude-haiku-4-5-20251001";
      else if (m === "opus") model = DEFAULT_MODEL;
      else model = m;
    } else if (args[i] === "--env" && args[i + 1]) {
      envId = args[++i];
    } else {
      promptArgs.push(args[i]);
    }
  }

  const prompt = await readPrompt(promptArgs);

  if (!envId) {
    const sessions = await api<{ data: { environment_id: string; environment_kind: string }[] }>(
      "code/sessions?limit=5",
    );
    const cloud = sessions.data.find((s) => s.environment_kind === "anthropic_cloud");
    envId = cloud?.environment_id;
    if (!envId) {
      console.error("Error: no existing cloud environment found. Pass --env <environment_id>.");
      process.exit(1);
    }
  }

  const created = await api<{ session: { id: string } }>("code/sessions", {
    method: "POST",
    body: { environment_id: envId, config: { model } },
  });
  const cseId = created.session.id;
  const sessionId = toSession(cseId);

  await sendEvent(sessionId, prompt);

  console.log(`${cseId}`);
  console.log(`${WEB_BASE}/${sessionId}`);
}

async function cmdList(): Promise<void> {
  const data = await api<{ data: Session[] }>("code/sessions?limit=100");
  const sessions = data.data.filter((s) => s.status !== "archived");

  const SEP = " │ ";
  const header = `st${SEP}${"last active".padEnd(12)}${SEP}${"model".padEnd(8)}${SEP}${"kind".padEnd(6)}${SEP}${"repo".padEnd(30)}${SEP}${"branch".padEnd(24)}${SEP}${"id".padEnd(30)}${SEP}title`;
  console.log(header);
  console.log("-".repeat(header.replace(/\x1b\[[0-9;]*m/g, "").length));

  for (const s of sessions) {
    const icon = statusIcon(s);
    const time = pad(relativeTime(s.last_event_at), 12);
    const mdl = pad(modelShort(s.config?.model), 8);
    const kind = pad(s.environment_kind === "anthropic_cloud" ? "cloud" : "bridge", 6);
    const repo = pad(repoName(s.config?.sources || []), 30);
    const branch = pad(branchName(s.config?.outcomes || []), 24);
    const id = pad(s.id, 30);
    const title = (s.title || "(untitled)").replace(/\n/g, " ").slice(0, 50);
    console.log(`${icon} ${SEP}${time}${SEP}${mdl}${SEP}${kind}${SEP}${repo}${SEP}${branch}${SEP}${id}${SEP}${title}`);
  }
}

async function cmdResult(sessionId: string, messagesN?: number): Promise<void> {
  const cseId = toCse(sessionId);
  const limit = messagesN ? messagesN * 3 + 10 : 20;
  const data = await api<{ data: SessionEvent[] }>(
    `code/sessions/${cseId}/events?limit=${limit}`,
  );

  if (messagesN) {
    const turns: { role: string; text: string }[] = [];
    for (const ev of data.data) {
      if (turns.length >= messagesN) break;
      if (ev.event_type === "user" || ev.event_type === "assistant") {
        const msg = ev.payload.message;
        if (!msg) continue;
        const content = msg.content;
        let text: string;
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((b: ContentBlock) => b.type === "text" && b.text)
            .map((b: ContentBlock) => b.text!)
            .join("\n");
        } else {
          continue;
        }
        if (!text) continue;
        turns.push({ role: msg.role, text });
      }
    }
    for (const t of turns.reverse()) {
      const prefix = t.role === "user" ? "\x1b[36m>> " : "";
      const suffix = t.role === "user" ? "\x1b[0m" : "";
      console.log(`${prefix}${t.text}${suffix}\n`);
    }
  } else {
    for (const ev of data.data) {
      if (ev.event_type === "result" && ev.payload.result) {
        const cost = ev.payload.total_cost_usd;
        const costStr = cost != null ? ` ($${cost.toFixed(4)})` : "";
        console.log(ev.payload.result);
        console.log(
          `\n---\nstop: ${ev.payload.stop_reason || "?"}${costStr}  ${ev.created_at}`,
        );
        return;
      }
    }
    console.log("(no result found)");
  }
}

async function cmdWatch(sessionId: string): Promise<void> {
  const cseId = toCse(sessionId);
  process.stderr.write(`Watching ${cseId}...\n`);

  while (true) {
    const detail = await api<{ response_shape?: SessionDetail } & SessionDetail>(
      `code/sessions/${cseId}`,
    );
    const shape = detail.response_shape || detail;
    const ws = shape.worker_status;

    if (ws === "idle") {
      const events = await api<{ data: SessionEvent[] }>(
        `code/sessions/${cseId}/events?limit=5`,
      );
      for (const ev of events.data) {
        if (ev.event_type === "result" && ev.payload.result) {
          console.log(ev.payload.result);
          const cost = ev.payload.total_cost_usd;
          if (cost != null) {
            console.log(`\n---\ncost: $${cost.toFixed(4)}  ${ev.created_at}`);
          }
          return;
        }
      }
      console.log("(session idle, no result found)");
      return;
    }

    if (ws === "WORKER_STATUS_UNSPECIFIED") {
      process.stderr.write("  starting...\n");
    } else {
      process.stderr.write(`  worker_status: ${ws}\n`);
    }

    await Bun.sleep(POLL_INTERVAL_MS);
  }
}

async function cmdSend(sessionId: string, args: string[]): Promise<void> {
  const sid = toSession(sessionId);
  const prompt = await readPrompt(args);
  await sendEvent(sid, prompt);
  console.log(`Sent to ${toCse(sessionId)}`);
}

async function cmdAutoFix(sessionId: string, repo: string, prNumber: number): Promise<void> {
  const sid = toSession(sessionId);
  await api("code/github/subscribe-pr", {
    method: "POST",
    beta: BETA_BYOC,
    body: { session_id: sid, repo, pr_number: prNumber },
  });
  console.log(`Subscribed ${toCse(sessionId)} to ${repo}#${prNumber} auto-fix`);
}

async function cmdNoAutoFix(sessionId: string, explicitRepo?: string, explicitPr?: number): Promise<void> {
  const cseId = toCse(sessionId);
  const sid = toSession(sessionId);

  let repo = explicitRepo;
  let prNumber = explicitPr;

  if (!repo) {
    const detail = await api<{ response_shape?: SessionDetail } & SessionDetail>(
      `code/sessions/${cseId}`,
    );
    const shape = detail.response_shape || detail;
    const sources = shape.config?.sources || [];
    for (const src of sources) {
      if (src.url) {
        const match = src.url.match(/([^/]+\/[^/]+?)(?:\.git)?$/);
        if (match) {
          repo = match[1];
          break;
        }
      }
    }
  }

  if (!repo) {
    console.error("Error: could not determine repo from session config. Use: no-auto-fix <id> <repo> <pr#>");
    process.exit(1);
  }

  if (!prNumber) {
    const events = await api<{ data: SessionEvent[] }>(
      `code/sessions/${cseId}/events?limit=50`,
    );
    for (const ev of events.data) {
      if (ev.event_type === "user") {
        const content = ev.payload.message?.content;
        if (typeof content === "string") {
          const match = content.match(/subscribed to PR activity for .+#(\d+)/);
          if (match) {
            prNumber = parseInt(match[1], 10);
            break;
          }
        }
      }
    }
  }

  if (!prNumber) {
    console.error("Error: could not determine PR number from session events. Use: no-auto-fix <id> <repo> <pr#>");
    process.exit(1);
  }

  await api("code/github/unsubscribe-pr", {
    method: "POST",
    beta: BETA_BYOC,
    body: { session_id: sid, repo, pr_number: prNumber },
  });
  console.log(`Unsubscribed ${cseId} from ${repo}#${prNumber} auto-fix`);
}

interface ContentBlock {
  type: string;
  text?: string;
}

interface Session {
  id: string;
  title: string;
  status: string;
  connection_status: string;
  worker_status: string;
  environment_kind: string;
  environment_id: string;
  created_at: string;
  last_event_at: string;
  tags: string[];
  config: {
    model?: string;
    sources?: { type: string; url?: string }[];
    outcomes?: { type: string; git_info?: { branches: string[] } }[];
  };
}

interface SessionDetail {
  worker_status: string;
  config?: {
    model?: string;
    sources?: { type: string; url?: string }[];
  };
}

interface SessionEvent {
  event_type: string;
  created_at: string;
  payload: {
    result?: string;
    total_cost_usd?: number;
    stop_reason?: string;
    message?: {
      role: string;
      content: string | ContentBlock[];
    };
    [key: string]: unknown;
  };
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "spawn":
    await cmdSpawn(rest);
    break;
  case "list":
  case "ls":
    await cmdList();
    break;
  case "result":
  case "res": {
    const id = rest[0];
    if (!id) {
      console.error("Usage: cli.ts result <session-id> [--messages N]");
      process.exit(1);
    }
    const msgIdx = rest.indexOf("--messages");
    const messagesN = msgIdx !== -1 ? parseInt(rest[msgIdx + 1], 10) : undefined;
    await cmdResult(id, messagesN);
    break;
  }
  case "watch": {
    const id = rest[0];
    if (!id) {
      console.error("Usage: cli.ts watch <session-id>");
      process.exit(1);
    }
    await cmdWatch(id);
    break;
  }
  case "send": {
    const id = rest[0];
    if (!id) {
      console.error("Usage: cli.ts send <session-id> [prompt]");
      process.exit(1);
    }
    await cmdSend(id, rest.slice(1));
    break;
  }
  case "auto-fix": {
    const [id, repo, pr] = rest;
    if (!id || !repo || !pr) {
      console.error("Usage: cli.ts auto-fix <session-id> <owner/repo> <pr-number>");
      process.exit(1);
    }
    await cmdAutoFix(id, repo, parseInt(pr, 10));
    break;
  }
  case "no-auto-fix": {
    const id = rest[0];
    if (!id) {
      console.error("Usage: cli.ts no-auto-fix <session-id> [<owner/repo> <pr-number>]");
      process.exit(1);
    }
    const noFixRepo = rest[1];
    const noFixPr = rest[2] ? parseInt(rest[2], 10) : undefined;
    await cmdNoAutoFix(id, noFixRepo, noFixPr);
    break;
  }
  default:
    console.log(`Usage: cli.ts <command> [args...]

Commands:
  spawn [prompt]                        Create a remote session and send prompt
  list                                  List active remote sessions
  result <id> [--messages N]            Get last result or N conversation turns
  watch <id>                            Poll until session completes
  send <id> [prompt]                    Send a follow-up message
  auto-fix <id> <owner/repo> <pr#>      Subscribe to PR auto-fix
  no-auto-fix <id> [<owner/repo> <pr#>]  Unsubscribe from PR auto-fix

Prompt can be passed as argument or piped via stdin.
Session IDs accept both cse_ and session_ prefixes.

Options for spawn:
  --model <model>    Model alias (opus, sonnet, haiku) or full ID. Default: opus
  --env <env-id>     Environment ID to reuse. Default: auto-detect`);
    if (command) process.exit(1);
}

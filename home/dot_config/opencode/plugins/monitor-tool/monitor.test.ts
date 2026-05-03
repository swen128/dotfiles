import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { EventSource } from "eventsource";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import MonitorPlugin from "./index";

const PORT = 4099;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProc: ChildProcess;
let client: ReturnType<typeof createOpencodeClient>;
let hooks: Awaited<ReturnType<typeof MonitorPlugin>>;
let es: EventSource;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function newSession(): Promise<string> {
  const r = await client.session.create({ body: {} });
  return ((r as any).data ?? r).id;
}

function ctx(sessionID: string) {
  return {
    sessionID,
    messageID: "msg_test",
    agent: "test",
    directory: process.cwd(),
    worktree: process.cwd(),
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };
}

async function syntheticUserTexts(sessionID: string): Promise<string[]> {
  const r = await client.session.messages({ path: { id: sessionID } });
  const msgs = (r as any).data ?? r;
  const out: string[] = [];
  for (const m of msgs as any[]) {
    if (m.info?.role !== "user") continue;
    for (const p of m.parts ?? []) {
      if (p.type === "text" && p.synthetic) out.push(p.text);
    }
  }
  return out;
}

beforeAll(async () => {
  serverProc = spawn("opencode", ["serve", "--port", String(PORT)], {
    stdio: "ignore",
    detached: false,
  });
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      const r = await fetch(`${BASE_URL}/app`);
      if (r.ok) break;
    } catch {}
  }
  client = createOpencodeClient({ baseUrl: BASE_URL });
  hooks = await MonitorPlugin({
    client,
    project: {} as any,
    directory: process.cwd(),
    worktree: process.cwd(),
  } as any);
  es = new EventSource(`${BASE_URL}/event`);
  es.addEventListener("message", async (m) => {
    try {
      const e = JSON.parse((m as MessageEvent).data);
      if (e.type === "session.status" && hooks.event) {
        await hooks.event({ event: e });
      }
    } catch {}
  });
  await sleep(300);
});

afterAll(() => {
  try { es?.close(); } catch {}
  try { serverProc?.kill("SIGTERM"); } catch {}
});

describe("monitor", () => {
  test("200ms batches stdout lines into one event", async () => {
    const sid = await newSession();
    await hooks.tool.monitor.execute(
      {
        command: "for i in 1 2 3 4 5; do echo line-$i; done",
        description: "batch",
        persistent: false,
        timeout_ms: 30000,
      },
      ctx(sid),
    );
    await sleep(2500);
    const events = await syntheticUserTexts(sid);
    const first = events.find((e) => e.includes("<monitor_event"));
    expect(first).toBeDefined();
    const lineHits = first!.split("\n").filter((l) => l.startsWith("line-"));
    expect(lineHits).toHaveLength(5);
  });

  test("stderr → log file, only stdout becomes events", async () => {
    const sid = await newSession();
    const r = await hooks.tool.monitor.execute(
      {
        command: "echo on-stdout; echo on-stderr 1>&2; echo more-stdout",
        description: "stderr-test",
        persistent: false,
        timeout_ms: 30000,
      },
      ctx(sid),
    );
    const text = typeof r === "string" ? r : r.output;
    const logPath = text.match(/log file: (.*)/)![1]!;
    await sleep(2000);

    const events = await syntheticUserTexts(sid);
    const eventText = events.join("\n");
    expect(eventText).toContain("on-stdout");
    expect(eventText).toContain("more-stdout");
    expect(eventText).not.toContain("on-stderr");

    const log = readFileSync(logPath, "utf-8");
    expect(log).toContain("on-stdout");
    expect(log).toContain("on-stderr");
    expect(log).toContain("more-stdout");
  });

  test("timeout_ms kills the process and emits monitor_timeout", async () => {
    const sid = await newSession();
    const start = Date.now();
    await hooks.tool.monitor.execute(
      {
        command: "sleep 30; echo done",
        description: "timeout-test",
        persistent: false,
        timeout_ms: 1500,
      },
      ctx(sid),
    );
    await sleep(3500);
    const events = await syntheticUserTexts(sid);
    const eventText = events.join("\n");
    expect(eventText).toContain("<monitor_timeout");
    expect(eventText).not.toContain("done");
    expect(Date.now() - start).toBeLessThan(6000);
  });

  test("persistent: true keeps process alive past timeout_ms", async () => {
    const sid = await newSession();
    const r = await hooks.tool.monitor.execute(
      {
        command: "sleep 5; echo done",
        description: "persistent-test",
        persistent: true,
        timeout_ms: 100,
      },
      ctx(sid),
    );
    const text = typeof r === "string" ? r : r.output;
    const taskId = text.match(/task_id: (mon_[a-f0-9]+)/)![1]!;
    const pid = Number(text.match(/pid: (\d+)/)![1]!);
    await sleep(800);
    expect(spawnSync("kill", ["-0", String(pid)]).status).toBe(0);
    const events = await syntheticUserTexts(sid);
    expect(events.join("\n")).not.toContain("monitor_timeout");
    await hooks.tool.monitor_stop.execute({ task_id: taskId }, ctx(sid));
  });

  test("monitor_stop kills the underlying process", async () => {
    const sid = await newSession();
    const r = await hooks.tool.monitor.execute(
      {
        command: "sleep 60",
        description: "stop-test",
        persistent: true,
        timeout_ms: 60000,
      },
      ctx(sid),
    );
    const text = typeof r === "string" ? r : r.output;
    const taskId = text.match(/task_id: (mon_[a-f0-9]+)/)![1]!;
    const pid = Number(text.match(/pid: (\d+)/)![1]!);
    await sleep(300);
    expect(spawnSync("kill", ["-0", String(pid)]).status).toBe(0);

    const stop = await hooks.tool.monitor_stop.execute({ task_id: taskId }, ctx(sid));
    const stopText = typeof stop === "string" ? stop : stop.output;
    expect(stopText).toContain("Stop requested");

    let dead = false;
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      if (spawnSync("kill", ["-0", String(pid)]).status !== 0) {
        dead = true;
        break;
      }
    }
    expect(dead).toBe(true);
  });

});

import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";
import { createWriteStream, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const BATCH_WINDOW_MS = 200;
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_TIMEOUT_MS = 3_600_000;
const AUTO_STOP_EVENT_LIMIT = 1000;
const FORCE_KILL_DELAY_MS = 3_000;

const logsDir = join(tmpdir(), "opencode-monitor-logs");
mkdirSync(logsDir, { recursive: true });

const MONITOR_DESCRIPTION = `Start a background monitor that streams events from a long-running script. Each stdout line is an event — you keep working and notifications arrive in the chat. Events arrive on their own schedule and are not replies from the user, even if one lands while you're waiting for the user to answer a question.

Pick by how many notifications you need:
- **One** ("tell me when the server is ready / the build finishes") → use **Bash with \`run_in_background\`** and a command that exits when the condition is true, e.g. \`until grep -q "Ready in" dev.log; do sleep 0.5; done\`. You get a single completion notification when it exits.
- **One per occurrence, indefinitely** ("tell me every time an ERROR line appears") → Monitor with an unbounded command (\`tail -f\`, \`inotifywait -m\`, \`while true\`).
- **One per occurrence, until a known end** ("emit each CI step result, stop when the run completes") → Monitor with a command that emits lines and then exits.

Your script's stdout is the event stream. Each line becomes a notification. Exit ends the watch.

  # Each matching log line is an event
  tail -f /var/log/app.log | grep --line-buffered "ERROR"

  # Each file change is an event
  inotifywait -m --format '%e %f' /watched/dir

  # Poll GitHub for new PR comments and emit one line per new comment
  last=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  while true; do
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    gh api "repos/owner/repo/issues/123/comments?since=$last" --jq '.[] | "\\(.user.login): \\(.body)"'
    last=$now; sleep 30
  done

  # Node script that emits events as they arrive (e.g. WebSocket listener)
  node watch-for-events.js

  # Per-occurrence with a natural end: emit each CI check as it lands, exit when the run completes
  prev=""
  while true; do
    s=$(gh pr checks 123 --json name,bucket)
    cur=$(jq -r '.[] | select(.bucket!="pending") | "\\(.name): \\(.bucket)"' <<<"$s" | sort)
    comm -13 <(echo "$prev") <(echo "$cur")
    prev=$cur
    jq -e 'all(.bucket!="pending")' <<<"$s" >/dev/null && break
    sleep 30
  done

**Don't use an unbounded command for a single notification.** \`tail -f\`, \`inotifywait -m\`, and \`while true\` never exit on their own, so the monitor stays armed until timeout even after the event has fired. For "tell me when X is ready," use Bash \`run_in_background\` with an \`until\` loop instead (one notification, ends in seconds). Note that \`tail -f log | grep -m 1 ...\` does *not* fix this: if the log goes quiet after the match, \`tail\` never receives SIGPIPE and the pipeline hangs anyway.

**Script quality:**
- Force line-buffered stdout for every command in the pipeline — pipes block-buffer by default and swallow events.
- In poll loops, handle transient failures (\`curl ... || true\`) — one failed request shouldn't kill the monitor.
- Poll intervals: 30s+ for remote APIs (rate limits), 0.5-1s for local checks.
- Write a specific \`description\` — it appears in every notification ("errors in deploy.log" not "watching logs").
- Only stdout is the event stream. Stderr goes to the output file (readable via Read) but does not trigger notifications — for a command you run directly (e.g. \`python train.py 2>&1 | grep --line-buffered ...\`), merge stderr with \`2>&1\` so its failures reach your filter. (No effect on \`tail -f\` of an existing log — that file only contains what its writer redirected.)

**Coverage — silence is not success.** When watching a job or process for an outcome, your filter must match every terminal state, not just the happy path. A monitor that greps only for the success marker stays silent through a crashloop, a hung process, or an unexpected exit — and silence looks identical to "still running." Before arming, ask: *if this process crashed right now, would my filter emit anything?* If not, widen it.

  # Wrong — silent on crash, hang, or any non-success exit
  tail -f run.log | grep --line-buffered "elapsed_steps="

  # Right — one alternation covering progress + the failure signatures you'd act on
  tail -f run.log | grep -E --line-buffered "elapsed_steps=|Traceback|Error|FAILED|assert|Killed|OOM"

For poll loops checking job state, emit on every terminal status (\`succeeded|failed|cancelled|timeout\`), not just success. If you cannot confidently enumerate the failure signatures, broaden the grep alternation rather than narrow it — some extra noise is better than missing a crashloop.

**Output volume**: Every stdout line is a conversation message, so the filter should be selective — but selective means "the lines you'd act on," not "only good news." Never pipe raw logs; use \`grep --line-buffered\`, \`awk\`, or a wrapper that emits exactly the success and failure signals you care about. Monitors that produce too many events are automatically stopped; restart with a tighter filter if this happens.

Stdout lines within 200ms are batched into a single notification, so multiline output from a single event groups naturally.

The script runs in the same shell environment as Bash. Exit ends the watch (exit code is reported). Timeout → killed. Set \`persistent: true\` for session-length watches (PR monitoring, log tails) — the monitor runs until you call monitor_stop or the session ends. Use monitor_stop to cancel early.

When an event lands that the user would want to act on now — an error appeared, the status they were waiting on flipped — send a PushNotification. Not every event is worth a push; the ones that change what they'd do next are.`;

const TASKSTOP_DESCRIPTION = `Stop a running monitor (started via the monitor tool) before it would naturally exit. Sends SIGTERM to the monitored process, then SIGKILL after ${FORCE_KILL_DELAY_MS}ms if it hasn't exited. The exit notification still arrives in the chat as <monitor_exit>. Returns immediately once the stop request is dispatched.`;

type MonitorState = {
  id: string;
  proc: ReturnType<typeof Bun.spawn>;
  description: string;
  command: string;
  logPath: string;
  startedAt: number;
  eventCount: number;
  stopped: boolean;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  batchTimer: ReturnType<typeof setTimeout> | null;
  batchBuffer: string[];
  sessionID: string;
};

export const MonitorPlugin: Plugin = async (input: PluginInput) => {
  const monitors = new Map<string, MonitorState>();
  const pending = new Map<string, string[]>();
  const busy = new Set<string>();

  const flush = (sessionID: string): void => {
    const buf = pending.get(sessionID);
    if (!buf || buf.length === 0) return;
    if (busy.has(sessionID)) return;
    busy.add(sessionID);
    const text = buf.join("\n\n");
    buf.length = 0;
    input.client.session
      .promptAsync({
        path: { id: sessionID },
        body: { parts: [{ type: "text", text, synthetic: true }] },
      })
      .catch((err) => {
        console.error("[monitor] promptAsync failed:", err);
        busy.delete(sessionID);
      });
  };

  const queue = (sessionID: string, text: string): void => {
    let buf = pending.get(sessionID);
    if (!buf) {
      buf = [];
      pending.set(sessionID, buf);
    }
    buf.push(text);
    flush(sessionID);
  };

  const flushBatch = (m: MonitorState): void => {
    if (m.batchBuffer.length === 0) return;
    const lines = m.batchBuffer;
    m.batchBuffer = [];
    if (m.batchTimer) {
      clearTimeout(m.batchTimer);
      m.batchTimer = null;
    }
    queue(
      m.sessionID,
      `<monitor_event description="${m.description}" task_id="${m.id}" pid="${m.proc.pid}">\n${lines.join("\n")}\n</monitor_event>`,
    );
    m.eventCount++;
    if (m.eventCount >= AUTO_STOP_EVENT_LIMIT && !m.stopped) {
      m.stopped = true;
      try { m.proc.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { m.proc.kill("SIGKILL"); } catch {} }, FORCE_KILL_DELAY_MS);
      queue(
        m.sessionID,
        `<monitor_autostop description="${m.description}" task_id="${m.id}" events="${m.eventCount}">Monitor auto-stopped after ${m.eventCount} events. Use a tighter filter and restart.</monitor_autostop>`,
      );
    }
  };

  return {
    event: async ({ event }) => {
      if (event.type !== "session.status") return;
      const { sessionID, status } = (event as { properties: { sessionID: string; status: { type: string } } }).properties;
      if (status.type === "busy") {
        busy.add(sessionID);
      } else {
        busy.delete(sessionID);
        flush(sessionID);
      }
    },

    tool: {
      monitor: tool({
        description: MONITOR_DESCRIPTION,
        args: {
          command: tool.schema
            .string()
            .describe("Shell command or script. Each stdout line is an event; exit ends the watch."),
          description: tool.schema
            .string()
            .describe("Short human-readable description of what you are monitoring (shown in notifications)."),
          persistent: tool.schema
            .boolean()
            .default(false)
            .describe(
              "Run for the lifetime of the session (no timeout). Use for session-length watches like PR monitoring or log tails. Stop with monitor_stop.",
            ),
          timeout_ms: tool.schema
            .number()
            .int()
            .min(1000)
            .max(MAX_TIMEOUT_MS)
            .default(DEFAULT_TIMEOUT_MS)
            .describe(
              `Kill the monitor after this deadline. Default ${DEFAULT_TIMEOUT_MS}ms, max ${MAX_TIMEOUT_MS}ms. Ignored when persistent is true.`,
            ),
        },
        async execute(args, ctx) {
          const id = "mon_" + randomBytes(6).toString("hex");
          const proc = Bun.spawn({
            cmd: ["sh", "-lc", args.command],
            cwd: ctx.directory,
            stdout: "pipe",
            stderr: "pipe",
            stdin: "ignore",
            env: { ...process.env },
          });
          const logPath = join(logsDir, `${id}.log`);
          const sink = createWriteStream(logPath, { flags: "a" });

          const m: MonitorState = {
            id,
            proc,
            description: args.description,
            command: args.command,
            logPath,
            startedAt: Date.now(),
            eventCount: 0,
            stopped: false,
            timeoutTimer: null,
            batchTimer: null,
            batchBuffer: [],
            sessionID: ctx.sessionID,
          };
          monitors.set(id, m);

          const consumeStdout = async () => {
            const reader = (proc.stdout as unknown as ReadableStream<Uint8Array>).getReader();
            const decoder = new TextDecoder();
            let buf = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!value) continue;
                sink.write(Buffer.from(value));
                buf += decoder.decode(value, { stream: true });
                let idx: number;
                while ((idx = buf.indexOf("\n")) >= 0) {
                  let line = buf.slice(0, idx);
                  if (line.endsWith("\r")) line = line.slice(0, -1);
                  m.batchBuffer.push(line);
                  buf = buf.slice(idx + 1);
                }
                if (m.batchBuffer.length > 0 && !m.batchTimer) {
                  m.batchTimer = setTimeout(() => flushBatch(m), BATCH_WINDOW_MS);
                }
              }
              const tail = decoder.decode();
              buf += tail;
              if (buf.length > 0) m.batchBuffer.push(buf);
              flushBatch(m);
            } finally {
              try { reader.releaseLock(); } catch {}
            }
          };

          const consumeStderr = async () => {
            const reader = (proc.stderr as unknown as ReadableStream<Uint8Array>).getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!value) continue;
                sink.write(Buffer.from(value));
              }
            } finally {
              try { reader.releaseLock(); } catch {}
            }
          };

          if (!args.persistent) {
            m.timeoutTimer = setTimeout(() => {
              if (m.stopped) return;
              m.stopped = true;
              try { proc.kill("SIGTERM"); } catch {}
              setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, FORCE_KILL_DELAY_MS);
              queue(
                m.sessionID,
                `<monitor_timeout description="${m.description}" task_id="${m.id}" timeout_ms="${args.timeout_ms}"/>`,
              );
            }, args.timeout_ms);
          }

          void (async () => {
            await Promise.all([consumeStdout(), consumeStderr()]);
            const code = await proc.exited;
            sink.end();
            if (m.timeoutTimer) clearTimeout(m.timeoutTimer);
            if (m.batchTimer) {
              clearTimeout(m.batchTimer);
              flushBatch(m);
            }
            const elapsed = ((Date.now() - m.startedAt) / 1000).toFixed(1);
            queue(
              m.sessionID,
              `<monitor_exit description="${m.description}" task_id="${m.id}" pid="${proc.pid}" exit_code="${code}" elapsed="${elapsed}s" log="${logPath}"/>`,
            );
            monitors.delete(id);
          })();

          ctx.metadata({
            title: args.description,
            metadata: { task_id: id, pid: proc.pid, command: args.command, log: logPath },
          });

          return [
            `Monitor started.`,
            `task_id: ${id}`,
            `pid: ${proc.pid}`,
            `command: ${args.command}`,
            `log file: ${logPath}`,
            `timeout: ${args.persistent ? "none (persistent)" : args.timeout_ms + "ms"}`,
            ``,
            `stdout lines arrive as <monitor_event> notifications (200ms-batched).`,
            `stderr is written to the log file (read with the Read tool to inspect).`,
            `Stop early with monitor_stop task_id="${id}".`,
          ].join("\n");
        },
      }),

      monitor_stop: tool({
        description: TASKSTOP_DESCRIPTION,
        args: {
          task_id: tool.schema.string().describe("The task_id of the monitor to stop (returned by the monitor tool)."),
        },
        async execute(args) {
          const m = monitors.get(args.task_id);
          if (!m) return `No running monitor with task_id="${args.task_id}".`;
          if (m.stopped) return `Monitor task_id="${args.task_id}" is already stopping.`;
          m.stopped = true;
          if (m.timeoutTimer) clearTimeout(m.timeoutTimer);
          try { m.proc.kill("SIGTERM"); } catch {}
          setTimeout(() => { try { m.proc.kill("SIGKILL"); } catch {} }, FORCE_KILL_DELAY_MS);
          return `Stop requested for monitor task_id="${args.task_id}". SIGTERM sent (SIGKILL after ${FORCE_KILL_DELAY_MS}ms). Exit notification will arrive in chat.`;
        },
      }),
    },
  };
};

export default MonitorPlugin;

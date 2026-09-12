import { RateLimitError, retryAfterMs } from "./cache";
import { execFile, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { parseClaude, parseCodex, record } from "./model";

export async function fetchClaude() {
  let token: unknown;
  try {
    const { stdout } = await promisify(execFile)(
      "/usr/bin/security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 10000, maxBuffer: 1024 * 1024 },
    );
    token = record(record(JSON.parse(stdout)).claudeAiOauth).accessToken;
  } catch {
    throw new Error("Claude login unavailable. Sign in to Claude Code and allow Keychain access.");
  }
  if (typeof token !== "string" || !token) throw new Error("Sign in to Claude Code to view usage.");
  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 429) throw new RateLimitError(retryAfterMs(response.headers.get("retry-after")));
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Claude login expired. Sign in to Claude Code again."
        : `Claude usage request failed (HTTP ${response.status}).`,
    );
  return parseClaude(await response.json());
}

async function codexExecutable(configured?: string): Promise<string> {
  const candidates = configured?.trim()
    ? [configured.replace(/^~\//, `${homedir()}/`)]
    : [
        join(homedir(), ".local/bin/codex"),
        "/opt/homebrew/bin/codex",
        "/usr/local/bin/codex",
        "/Applications/Codex.app/Contents/Resources/codex",
        join(homedir(), ".local/share/mise/shims/codex"),
        ...(process.env.PATH ?? "")
          .split(":")
          .filter(Boolean)
          .map((directory) => join(directory, "codex")),
      ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* Try next installation. */
    }
  }
  throw new Error("Codex executable not found. Set its absolute path in extension preferences.");
}

// A short-lived stdio connection: initialize, read limits, then terminate. No agent turn is started.
export function readCodexLimits(executable: string, timeoutMs = 20000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["app-server"], {
      cwd: homedir(),
      stdio: ["pipe", "pipe", "ignore"],
    });
    const lines = createInterface({ input: child.stdout });
    let settled = false;
    const timer = setTimeout(() => finish(new Error("Codex usage request timed out.")), timeoutMs);
    function finish(error?: Error, value?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      child.kill();
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      killTimer.unref();
      child.once("close", () => clearTimeout(killTimer));
      if (error) reject(error);
      else resolve(value);
    }
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.once("error", () => finish(new Error("Could not start Codex. Check the executable preference.")));
    child.stdin.on("error", () => finish(new Error("Codex connection closed unexpectedly.")));
    child.once("exit", () =>
      finish(new Error("Codex exited before returning usage. Check codex login and configuration.")),
    );
    lines.on("line", (line) => {
      let message;
      try {
        message = record(JSON.parse(line));
      } catch {
        return;
      }
      if (message.id !== 1 && message.id !== 2) return;
      if (message.error)
        return finish(new Error("Codex could not read usage. Check codex login (ChatGPT) and update the CLI."));
      if (message.id === 1) {
        send({ method: "initialized" });
        send({ id: 2, method: "account/rateLimits/read" });
      } else finish(undefined, message.result);
    });
    send({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "raycast_ai_usage", version: "1.0.0" } },
    });
  });
}
export async function fetchCodex(path?: string) {
  return parseCodex(await readCodexLimits(await codexExecutable(path)));
}

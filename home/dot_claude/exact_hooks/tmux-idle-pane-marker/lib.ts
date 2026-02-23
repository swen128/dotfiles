import { mkdir, writeFile, unlink, readdir, rmdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const IDLE_PANES_DIR = join(homedir(), ".claude", "idle-panes");
const BUSY_SUBAGENTS_DIR = join(homedir(), ".claude", "busy-subagents");

export async function markIdle(pane: string): Promise<void> {
  await mkdir(IDLE_PANES_DIR, { recursive: true });
  await writeFile(join(IDLE_PANES_DIR, pane), "");
}

export async function clearIdle(pane: string): Promise<void> {
  await unlink(join(IDLE_PANES_DIR, pane)).catch(() => {});
}

export async function trackSubagent(pane: string, agentId: string): Promise<void> {
  const dir = join(BUSY_SUBAGENTS_DIR, pane);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, agentId), "");
}

export async function untrackSubagent(pane: string, agentId: string): Promise<void> {
  const dir = join(BUSY_SUBAGENTS_DIR, pane);
  await unlink(join(dir, agentId)).catch(() => {});
  const remaining = await readdir(dir).catch(() => []);
  if (remaining.length === 0) {
    await rmdir(dir).catch(() => {});
  }
}

export async function cleanup(pane: string): Promise<void> {
  await Promise.all([
    unlink(join(IDLE_PANES_DIR, pane)).catch(() => {}),
    rm(join(BUSY_SUBAGENTS_DIR, pane), { recursive: true, force: true }).catch(() => {}),
  ]);
}

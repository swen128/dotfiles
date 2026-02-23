#!/usr/bin/env bun
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { handleSessionEnd } from "../hook.ts";

const allow = { decision: "allow" } as const;
const PANE_SESSIONS_DIR = join(homedir(), ".claude", "pane-sessions");

await handleSessionEnd(async () => {
  const pane = process.env["TMUX_PANE"];
  if (!pane) return allow;
  await unlink(join(PANE_SESSIONS_DIR, pane)).catch(() => {});
  return allow;
});

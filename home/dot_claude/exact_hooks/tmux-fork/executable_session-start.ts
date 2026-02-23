#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { handleSessionStart } from "../hook.ts";

const allow = { decision: "allow" } as const;
const PANE_SESSIONS_DIR = join(homedir(), ".claude", "pane-sessions");

await handleSessionStart(async (input) => {
  const pane = process.env["TMUX_PANE"];
  if (!pane) return allow;
  await mkdir(PANE_SESSIONS_DIR, { recursive: true });
  await writeFile(join(PANE_SESSIONS_DIR, pane), input.session_id);
  return allow;
});

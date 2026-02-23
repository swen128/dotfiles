#!/usr/bin/env bun
import { handleSubagentStop } from "../hook.ts";
import { untrackSubagent } from "./mod.ts";

const allow = { decision: "allow" } as const;

await handleSubagentStop(async (input) => {
  const pane = process.env["TMUX_PANE"];
  if (pane) await untrackSubagent(pane, input.agent_id);
  return allow;
});

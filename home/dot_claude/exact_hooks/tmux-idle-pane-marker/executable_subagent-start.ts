#!/usr/bin/env bun
import { handleSubagentStart } from "../hook.ts";
import { trackSubagent } from "./mod.ts";

const allow = { decision: "allow" } as const;

await handleSubagentStart(async (input) => {
  const pane = process.env["TMUX_PANE"];
  if (pane) await trackSubagent(pane, input.agent_id);
  return allow;
});

#!/usr/bin/env bun
import { handleStop } from "../hook.ts";
import { markIdle } from "./mod.ts";

const allow = { decision: "allow" } as const;

await handleStop(async () => {
  const pane = process.env["TMUX_PANE"];
  if (pane) await markIdle(pane);
  return allow;
});

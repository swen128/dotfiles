#!/usr/bin/env bun
import { handleSessionEnd } from "../hook.ts";
import { cleanup } from "./lib.ts";

const allow = { decision: "allow" } as const;

await handleSessionEnd(async () => {
  const pane = process.env["TMUX_PANE"];
  if (pane) await cleanup(pane);
  return allow;
});

#!/usr/bin/env bun
import { handleUserPromptSubmit } from "../hook.ts";
import { clearIdle } from "./lib.ts";

const allow = { decision: "allow" } as const;

await handleUserPromptSubmit(async () => {
  const pane = process.env["TMUX_PANE"];
  if (pane) await clearIdle(pane);
  return allow;
});

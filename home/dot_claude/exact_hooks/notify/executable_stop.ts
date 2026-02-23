#!/usr/bin/env bun
import { handleStop } from "../hook.ts";
import { fireConfetti } from "./lib.ts";

const allow = { decision: "allow" } as const;

await handleStop(async (input) => {
  await fireConfetti(input.transcript_path);
  return allow;
});

#!/usr/bin/env bun
import { handleNotification } from "../hook.ts";
import { fireConfetti } from "./lib.ts";

const allow = { decision: "allow" } as const;

await handleNotification(async (input) => {
  await fireConfetti(input.transcript_path);
  return allow;
});

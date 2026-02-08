#!/usr/bin/env bun
import { handleNotification } from "./hook.ts";
import { readTranscript } from "./transcript.ts";

const allow = { decision: "allow" } as const;

await handleNotification(async (input) => {
  if (process.env["CLAUDE_CODE_ENTRYPOINT"] !== "cli") return allow;
  const transcript = await readTranscript(input.transcript_path);
  if (transcript?.teamName) return allow;
  Bun.spawn(["open", "-g", "raycast://confetti"]);
  return allow;
});

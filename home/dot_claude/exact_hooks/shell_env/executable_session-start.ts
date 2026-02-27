#!/usr/bin/env bun
import { appendFile } from "node:fs/promises";
import { handleSessionStart } from "../hook.ts";

const allow = { decision: "allow" } as const;

await handleSessionStart(async (input) => {
  const envFile = process.env["CLAUDE_ENV_FILE"];
  if (!envFile) return allow;

  const envContent = await Bun.file(`${import.meta.dir}/env.sh`).text();
  await appendFile(envFile, envContent);
  await appendFile(envFile, `export CLAUDE_CODE_SESSION_ID='${input.session_id}'\n`);
  return allow;
});

#!/usr/bin/env bun
import { runCli } from "./src/cli.ts";

runCli(process.argv).then(
  (code) => {
    process.exit(code);
  },
  (err) => {
    process.stderr.write(JSON.stringify({ error: "internal_error", message: String(err) }) + "\n");
    process.exit(1);
  },
);

#!/usr/bin/env bun
import { type Block, handlePreToolUse } from "./hook.ts";

const allow = { decision: "allow" } as const;

type NgRule = {
  commands: string[];
  message: string;
};

const ngCommands: readonly NgRule[] = [
  {
    commands: ["npm install", "npm i", "npm run", "npm test"],
    message: "Use bun instead of npm for package installation.",
  },
  {
    commands: ["--no-verify"],
    message:
      "Git commands with --no-verify flag are not allowed. Ensure all hooks pass.",
  },
  {
    commands: ["git add -A", "git add -u"],
    message: "Only stage what you've changed.",
  },
  {
    commands: ["rm -rf /", "rm -rf /*"],
    message: "Dangerous command blocked for safety.",
  },
];

function checkNgCommands(command: string): typeof allow | Block {
  const matched = ngCommands.find((rule) =>
    rule.commands.some((ng) => command.includes(ng)),
  );
  return matched
    ? { decision: "block", message: matched.message }
    : allow;
}

await handlePreToolUse(({ tool_name, tool_input }) => {
  if (tool_name !== "Bash") return allow;
  const command = tool_input["command"];
  if (typeof command !== "string") return allow;
  return checkNgCommands(command);
});

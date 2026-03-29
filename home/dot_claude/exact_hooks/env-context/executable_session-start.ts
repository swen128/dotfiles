#!/usr/bin/env bun
import { hostname, type } from "node:os";
import { $ } from "bun";
import { handleSessionStart } from "../hook.ts";

async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    return (await $`git -C ${cwd} ${args}`.text()).trim();
  } catch {
    return "";
  }
}

async function isGitRepo(cwd: string): Promise<boolean> {
  return (await git(cwd, "rev-parse", "--is-inside-work-tree")) === "true";
}

async function currentBranch(cwd: string): Promise<string> {
  const branch = await git(cwd, "branch", "--show-current");
  if (branch) return branch;
  const short = await git(cwd, "rev-parse", "--short", "HEAD");
  return short ? `(detached at ${short})` : "(unknown)";
}

async function detectMainBranch(cwd: string): Promise<string> {
  for (const candidate of ["main", "master"]) {
    const result = await git(cwd, "rev-parse", "--verify", candidate);
    if (result) return candidate;
  }
  return "main";
}

async function gitStatus(cwd: string): Promise<string> {
  const [branch, status, log, mainBranch] = await Promise.all([
    currentBranch(cwd),
    git(cwd, "status", "--short"),
    git(cwd, "log", "--oneline", "-5", "--no-decorate"),
    detectMainBranch(cwd),
  ]);

  return [
    `Current branch: ${branch}`,
    "",
    `Main branch (you will usually use this for PRs): ${mainBranch}`,
    "",
    `Status:`,
    status || "(clean)",
    "",
    `Recent commits:`,
    log || "(no commits)",
  ].join("\n");
}

await handleSessionStart(async (input) => {
  const { cwd, model, source } = input;

  if (source !== "startup") {
    return { decision: "allow" };
  }

  const shell = process.env.SHELL?.split("/").pop() ?? "unknown";
  const osType = type();
  const gitRepo = await isGitRepo(cwd);

  const lines: string[] = [
    `# Environment`,
    `You have been invoked in the following environment:`,
    ` - Primary working directory: ${cwd}`,
    `  - Is a git repository: ${gitRepo}`,
    ` - Platform: ${process.platform}`,
    ` - Shell: ${shell}`,
    ` - Hostname: ${hostname()}`,
    ` - OS: ${osType}`,
    ` - You are powered by the model named ${model}.`,
  ];

  if (gitRepo) {
    const status = await gitStatus(cwd);
    lines.push(
      "",
      `gitStatus: This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.`,
      status,
    );
  }

  return {
    decision: "output",
    data: {
      hookSpecificOutput: {
        hookEventName: "SessionStart" as const,
        additionalContext: lines.join("\n"),
      },
    },
  };
});

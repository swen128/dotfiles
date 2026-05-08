#!/usr/bin/env bun
import { readFileSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

if (positional.length !== 1) {
  console.error("usage: validate.ts <walkthrough.json> [--check-files]");
  process.exit(2);
}

const jsonPath = positional[0];
if (!existsSync(jsonPath)) {
  console.error(`error: file not found: ${jsonPath}`);
  process.exit(2);
}

const checkFiles = flags.has("--check-files");

let data: unknown;
try {
  data = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch (e) {
  console.error(`error: invalid JSON: ${(e as Error).message}`);
  process.exit(1);
}

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

if (!isObject(data)) {
  err("root must be an object");
  print();
  process.exit(1);
}

const root = data;

if (root.description !== undefined && typeof root.description !== "string") err(".description must be a string");
if (root.commit !== undefined && typeof root.commit !== "string") err(".commit must be a string");
if (typeof root.commit === "string" && root.commit !== "" && !/^[0-9a-f]{40}$/.test(root.commit)) {
  err(`.commit must be a full 40-char hex SHA (got "${root.commit}"); use \`git rev-parse HEAD\``);
}
if (root.description === undefined || root.description === "") warn(".description is missing (recommended)");
if (root.commit === undefined || root.commit === "") err(".commit is required; use `git rev-parse HEAD`");

if (!Array.isArray(root.steps)) {
  err(".steps must be an array");
} else if (root.steps.length === 0) {
  err(".steps is empty");
} else {
  root.steps.forEach((s, i) => validateStep(s, `.steps[${i}]`));
}

function validateStep(s: unknown, p: string) {
  if (!isObject(s)) {
    err(`${p} must be an object`);
    return;
  }
  if (typeof s.file !== "string" || s.file === "") err(`${p}.file must be a non-empty string`);
  if (typeof s.file === "string" && (s.file.startsWith("/") || s.file.startsWith("./") || s.file.includes("\\"))) {
    if (checkFiles) {
      err(`${p}.file must be repo-relative with forward slashes (got "${s.file}")`);
    } else {
      warn(`${p}.file should be repo-relative with forward slashes (got "${s.file}")`);
    }
  }
  if (!isPositiveInt(s.line)) err(`${p}.line must be a positive integer`);
  if (s.col !== undefined) err(`${p}.col is not a supported field (column positions are unreliable; remove it)`);
  if (s.note !== undefined && typeof s.note !== "string") err(`${p}.note must be a string`);
  if (s.note === undefined || s.note === "") warn(`${p}.note is missing (recommended)`);

  if (s.values !== undefined) {
    if (!Array.isArray(s.values)) {
      err(`${p}.values must be an array`);
    } else {
      s.values.forEach((v, j) => validateValue(v, `${p}.values[${j}]`));
    }
  }
}

function validateValue(v: unknown, p: string) {
  if (!isObject(v)) {
    err(`${p} must be an object`);
    return;
  }
  if (typeof v.name !== "string" || v.name === "") err(`${p}.name must be a non-empty string`);
  if (v.value === undefined || v.value === null) err(`${p}.value is required`);
  else if (typeof v.value !== "string") warn(`${p}.value should be a string (concrete example) — got ${typeof v.value}`);
  if (!isPositiveInt(v.line)) {
    err(`${p}.line is required and must be a positive integer (place each value on the line where it is observed; do not let it default to step.line)`);
  }
}

if (checkFiles && Array.isArray(root.steps) && errors.length === 0) {
  let repoRoot = "";
  try {
    repoRoot = execSync(`git -C "${dirname(resolve(jsonPath))}" rev-parse --show-toplevel`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {}
  if (!repoRoot) {
    warn("--check-files: not in a git repo, falling back to JSON's directory");
    repoRoot = dirname(resolve(jsonPath));
  }

  const lineCounts = new Map<string, number>();
  root.steps.forEach((s, i) => {
    if (!isObject(s) || typeof s.file !== "string") return;
    const fpath = resolve(repoRoot, s.file);
    if (!existsSync(fpath) || !statSync(fpath).isFile()) {
      err(`.steps[${i}]: file not found: ${s.file} (resolved to ${fpath})`);
      return;
    }
    let lc = lineCounts.get(fpath);
    if (lc === undefined) {
      const text = readFileSync(fpath, "utf8");
      const parts = text.split("\n");
      lc = text.endsWith("\n") ? parts.length - 1 : parts.length;
      if (lc === 0) lc = 1;
      lineCounts.set(fpath, lc);
    }
    if (typeof s.line === "number" && s.line > lc) {
      err(`.steps[${i}]: line ${s.line} exceeds file length ${lc}`);
    }
    if (Array.isArray(s.values)) {
      s.values.forEach((v, j) => {
        if (isObject(v) && typeof v.line === "number" && v.line > lc!) {
          err(`.steps[${i}].values[${j}]: line ${v.line} exceeds file length ${lc}`);
        }
      });
    }
  });
}

function print() {
  for (const w of warnings) console.warn(`warn: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
}

print();

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log(`OK${warnings.length > 0 ? ` (${warnings.length} warning${warnings.length > 1 ? "s" : ""})` : ""}`);

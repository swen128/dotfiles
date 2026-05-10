import { test, expect, beforeEach, afterEach } from "bun:test";
import { emit, emitError, emitStream } from "../src/output.ts";

let stdout = "";
let stderr = "";
let origStdoutWrite: typeof process.stdout.write;
let origStderrWrite: typeof process.stderr.write;

beforeEach(() => {
  stdout = "";
  stderr = "";
  origStdoutWrite = process.stdout.write.bind(process.stdout);
  origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((s: string | Uint8Array) => {
    stdout += typeof s === "string" ? s : new TextDecoder().decode(s);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((s: string | Uint8Array) => {
    stderr += typeof s === "string" ? s : new TextDecoder().decode(s);
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  process.stdout.write = origStdoutWrite;
  process.stderr.write = origStderrWrite;
});

test("emit json prints pretty JSON with trailing newline", () => {
  emit("json", { ok: true });
  expect(stdout.endsWith("\n")).toBe(true);
  expect(JSON.parse(stdout)).toEqual({ ok: true });
});

test("emit ndjson prints single-line JSON with trailing newline", () => {
  emit("ndjson", { ok: true });
  expect(stdout).toBe('{"ok":true}\n');
});

test("emitStream writes ndjson frames", () => {
  emitStream({ a: 1 });
  emitStream({ b: 2 });
  expect(stdout).toBe('{"a":1}\n{"b":2}\n');
});

test("emitError writes to stderr as ndjson", () => {
  emitError({ error: "x", message: "y" });
  expect(stderr).toBe('{"error":"x","message":"y"}\n');
});

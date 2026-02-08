import { describe, expect, test } from "bun:test";
import { readTranscript } from "./transcript.ts";
import { Glob } from "bun";

const glob = new Glob("**/*.jsonl");
const paths = Array.from(
  glob.scanSync({ cwd: `${process.env["HOME"]}/.claude/projects`, absolute: true }),
);

describe("readTranscript", () => {
  test("finds transcripts", () => {
    expect(paths.length).toBeGreaterThan(0);
  });

  for (const path of paths) {
    const name = path.replace(`${process.env["HOME"]}/.claude/projects/`, "");

    test(name, async () => {
      const transcript = await readTranscript(path);
      if (transcript === null) return;

      expect(typeof transcript.sessionId).toBe("string");
      expect(typeof transcript.cwd).toBe("string");
      expect(Array.isArray(transcript.messages)).toBe(true);
    });
  }
});

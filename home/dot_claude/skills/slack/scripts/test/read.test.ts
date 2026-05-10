import { test, expect } from "bun:test";
import { parsePermalink } from "../src/commands/read.ts";

test("parses a top-level message permalink", () => {
  const r = parsePermalink(
    "https://acme.slack.com/archives/C07NQKT61AA/p1777713934836739",
  );
  expect(r.channel).toBe("C07NQKT61AA");
  expect(r.ts).toBe("1777713934.836739");
  expect(r.threadTs).toBeNull();
});

test("parses a thread reply permalink and extracts thread_ts", () => {
  const r = parsePermalink(
    "https://acme.slack.com/archives/C07NQKT61AA/p1777713937418349?thread_ts=1777713934.836739&cid=C07NQKT61AA",
  );
  expect(r.channel).toBe("C07NQKT61AA");
  expect(r.ts).toBe("1777713937.418349");
  expect(r.threadTs).toBe("1777713934.836739");
});

test("parses a DM permalink", () => {
  const r = parsePermalink(
    "https://acme.slack.com/archives/D07LXF2HXCH/p1777715156076919",
  );
  expect(r.channel).toBe("D07LXF2HXCH");
  expect(r.ts).toBe("1777715156.076919");
});

test("rejects non-Slack URLs", () => {
  expect(() =>
    parsePermalink("https://example.com/archives/C123/p1234567890123456"),
  ).toThrow(/not a Slack permalink/);
});

test("rejects malformed paths", () => {
  expect(() => parsePermalink("https://acme.slack.com/team/U07")).toThrow(
    /not a Slack message permalink/,
  );
});

test("rejects non-URL strings", () => {
  expect(() => parsePermalink("not-a-url")).toThrow(/not a valid URL/);
});

import { test, expect } from "bun:test";
import { maskSecrets } from "../src/log.ts";

test("masks user tokens", () => {
  expect(maskSecrets("token: xoxp-1234567890-abcdefg")).toBe("token: xoxp-1…");
});

test("masks rotated user tokens", () => {
  expect(maskSecrets("xoxe.xoxp-12345-abcdef")).toBe("xoxe.x…");
});

test("masks bot tokens", () => {
  expect(maskSecrets("xoxb-1234567890-abcdef")).toBe("xoxb-1…");
});

test("masks refresh tokens", () => {
  expect(maskSecrets("xoxe-1-abcdef-12345")).toBe("xoxe-1…");
});

test("leaves non-secrets alone", () => {
  expect(maskSecrets("hello world")).toBe("hello world");
});

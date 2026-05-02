import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { generatePkce, generateState } from "../src/auth/pkce.ts";

test("PKCE verifier is base64url and 43–128 chars", () => {
  const { verifier } = generatePkce();
  expect(verifier.length).toBeGreaterThanOrEqual(43);
  expect(verifier.length).toBeLessThanOrEqual(128);
  expect(/^[A-Za-z0-9_-]+$/.test(verifier)).toBe(true);
});

test("PKCE challenge is S256(verifier) base64url", () => {
  const { verifier, challenge } = generatePkce();
  const expected = createHash("sha256")
    .update(verifier)
    .digest()
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  expect(challenge).toBe(expected);
});

test("state is base64url and unique across calls", () => {
  const a = generateState();
  const b = generateState();
  expect(a).not.toBe(b);
  expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
});

import { test, expect } from "bun:test";
import { buildManifest, USER_SCOPES } from "../src/slack/manifest.ts";

test("manifest contains the configured port in the redirect URL", () => {
  const m = buildManifest(12345);
  expect(m).toContain("http://127.0.0.1:12345/oauth/callback");
});

test("manifest contains every required user scope", () => {
  const m = buildManifest(53682);
  for (const scope of USER_SCOPES) {
    expect(m).toContain(`- ${scope}`);
  }
});

test("manifest enables token rotation and disables socket mode", () => {
  const m = buildManifest(53682);
  expect(m).toContain("token_rotation_enabled: true");
  expect(m).toContain("socket_mode_enabled: false");
});

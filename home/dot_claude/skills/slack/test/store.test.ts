import { test, expect, beforeEach, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempHome: string;

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), "slack-cli-test-"));
  process.env.HOME = tempHome;
  process.env.XDG_CONFIG_HOME = join(tempHome, "config");
  process.env.XDG_CACHE_HOME = join(tempHome, "cache");
});

afterAll(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
});

async function freshStore(): Promise<typeof import("../src/store/store.ts")> {
  return await import(`../src/store/store.ts?t=${Date.now()}`);
}

test("metadata file starts empty when no workspaces are stored", async () => {
  const store = await freshStore();
  const list = await store.listWorkspaces();
  expect(list.workspaces).toEqual([]);
  expect(list.default_workspace).toBeNull();
});

test("file-mode credentials roundtrip", async () => {
  const store = await freshStore();
  const creds = sampleCreds("T1");
  await store.putCredentials(creds, { setDefault: true }, "file");
  const back = await store.getCredentials("T1");
  expect(back).toMatchObject({
    team_id: "T1",
    access_token: creds.access_token,
    refresh_token: creds.refresh_token,
    client_secret: creds.client_secret,
  });
});

test("first login sets default; second does not unless asked", async () => {
  const store = await freshStore();
  await store.putCredentials(sampleCreds("T1"), { setDefault: false }, "file");
  await store.putCredentials(sampleCreds("T2"), { setDefault: false }, "file");
  const list = await store.listWorkspaces();
  expect(list.default_workspace).toBe("T1");
});

test("logout promotes a remaining workspace when default is removed", async () => {
  const store = await freshStore();
  await store.putCredentials(sampleCreds("T1"), { setDefault: true }, "file");
  await new Promise((r) => setTimeout(r, 5));
  await store.putCredentials(sampleCreds("T2"), { setDefault: false }, "file");
  const removed = await store.deleteWorkspace("T1");
  expect(removed.removed).toBe(true);
  expect(removed.promoted).toBe("T2");
  const list = await store.listWorkspaces();
  expect(list.default_workspace).toBe("T2");
});

test("ambiguous --workspace selector surfaces candidates", async () => {
  const store = await freshStore();
  await store.putCredentials({ ...sampleCreds("T1"), team_name: "Same" }, { setDefault: true }, "file");
  await store.putCredentials({ ...sampleCreds("T2"), team_name: "Same" }, { setDefault: false }, "file");
  await expect(store.resolveWorkspace("Same")).rejects.toMatchObject({
    code: "workspace_ambiguous",
  });
});

test("missing --workspace selector surfaces helpful error", async () => {
  const store = await freshStore();
  await store.putCredentials(sampleCreds("T1"), { setDefault: true }, "file");
  await expect(store.resolveWorkspace("nope")).rejects.toMatchObject({
    code: "workspace_not_found",
  });
});

function sampleCreds(teamId: string) {
  return {
    team_id: teamId,
    team_name: `team-${teamId}`,
    team_domain: `${teamId.toLowerCase()}-domain`,
    user_id: `U${teamId}`,
    client_id: `client-${teamId}`,
    client_secret: `secret-${teamId}`,
    access_token: `xoxe.xoxp-${teamId}-abc`,
    refresh_token: `xoxe-1-${teamId}-abc`,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    logged_in_at: new Date().toISOString(),
  };
}

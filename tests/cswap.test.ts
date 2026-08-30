import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../home/bin/executable_cswap");
const temporaryDirectories: string[] = [];

async function environment(): Promise<{ root: string; env: Record<string, string> }> {
  const root = await mkdtemp(join(tmpdir(), "cswap-test-"));
  temporaryDirectories.push(root);
  return {
    root,
    env: {
      ...process.env,
      HOME: root,
      CSWAP_PLATFORM: "linux",
      CSWAP_DATA_DIR: join(root, "data"),
      CSWAP_CONFIG_FILE: join(root, ".claude.json"),
      CSWAP_CREDENTIALS_FILE: join(root, ".claude", ".credentials.json"),
    } as Record<string, string>,
  };
}

function run(env: Record<string, string>, ...args: string[]) {
  return Bun.spawnSync(["bun", script, ...args], { env, stdout: "pipe", stderr: "pipe" });
}

function addToken(env: Record<string, string>, token: string, ...args: string[]) {
  return Bun.spawnSync(["bun", script, "add-token", "-", ...args], {
    env,
    stdin: Buffer.from(`${token}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("cswap", () => {
  test("registers, lists, and switches API key accounts", async () => {
    const { root, env } = await environment();

    expect(addToken(env, "sk-ant-api-first", "--email", "first@example.com").exitCode).toBe(0);
    expect(addToken(env, "sk-ant-api-second", "--email", "second@example.com").exitCode).toBe(0);

    const list = run(env, "list", "--json");
    expect(list.exitCode).toBe(0);
    expect(JSON.parse(list.stdout.toString()).accounts).toMatchObject([
      { number: 1, email: "first@example.com", kind: "api_key" },
      { number: 2, email: "second@example.com", kind: "api_key" },
    ]);

    expect(run(env, "switch", "1").exitCode).toBe(0);
    const firstConfig = JSON.parse(await readFile(join(root, ".claude.json"), "utf8"));
    expect(firstConfig.primaryApiKey).toBe("sk-ant-api-first");
    expect(firstConfig.customApiKeyResponses.approved).toEqual(["sk-ant-api-first"]);
    expect(run(env, "switch", "second@example.com").exitCode).toBe(0);
    expect(JSON.parse(await readFile(join(root, ".claude.json"), "utf8")).primaryApiKey).toBe("sk-ant-api-second");
  });

  test("captures the active OAuth account and preserves its alias", async () => {
    const { root, env } = await environment();
    await writeFile(join(root, ".claude.json"), JSON.stringify({
      oauthAccount: {
        emailAddress: "oauth@example.com",
        accountUuid: "account-1",
        organizationUuid: null,
        organizationName: null,
      },
      theme: "dark",
    }));
    await mkdir(join(root, ".claude"));
    await Bun.write(join(root, ".claude", ".credentials.json"), JSON.stringify({
      claudeAiOauth: { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 60_000 },
    }));

    expect(run(env, "add", "--alias", "personal").exitCode).toBe(0);
    const status = run(env, "status", "--json");
    expect(JSON.parse(status.stdout.toString()).active).toMatchObject({
      number: 1,
      email: "oauth@example.com",
      alias: "personal",
    });
  });

  test("disabled accounts are skipped by rotation", async () => {
    const { env } = await environment();
    addToken(env, "sk-ant-api-one", "--email", "one@example.com");
    addToken(env, "sk-ant-api-two", "--email", "two@example.com");
    run(env, "switch", "1");
    expect(run(env, "disable", "2").exitCode).toBe(0);

    const switched = run(env, "switch", "--json");
    expect(switched.exitCode).toBe(0);
    expect(JSON.parse(switched.stdout.toString())).toMatchObject({ switched: false, to: 1 });
  });

  test("exports and imports account credentials", async () => {
    const source = await environment();
    const target = await environment();
    const backup = join(source.root, "accounts.json");
    addToken(source.env, "sk-ant-api-exported", "--email", "export@example.com");

    expect(run(source.env, "export", backup).exitCode).toBe(0);
    expect(run(target.env, "import", backup).exitCode).toBe(0);
    expect(run(target.env, "switch", "1").exitCode).toBe(0);
    expect(JSON.parse(await readFile(join(target.root, ".claude.json"), "utf8")).primaryApiKey).toBe("sk-ant-api-exported");
  });

  test("rejects nonnumeric slots and unknown options", async () => {
    const { env } = await environment();
    expect(addToken(env, "sk-ant-api-test", "--slot", "../../escape").exitCode).toBe(2);
    expect(run(env, "list", "--surprise").exitCode).toBe(2);
    expect(run(env, "switch", "--strategy", "--json").exitCode).toBe(2);
  });

  test("force replacement of the active slot activates the new credential", async () => {
    const { root, env } = await environment();
    addToken(env, "sk-ant-api-old", "--slot", "1", "--email", "old@example.com");
    run(env, "switch", "1");
    addToken(env, "sk-ant-api-new", "--slot", "1", "--email", "new@example.com", "--force");

    expect(run(env, "switch", "1").exitCode).toBe(0);
    expect(JSON.parse(await readFile(join(root, ".claude.json"), "utf8")).primaryApiKey).toBe("sk-ant-api-new");
  });

  test("rejects false-like force values instead of enabling force", async () => {
    const { env } = await environment();
    addToken(env, "sk-ant-api-kept");

    expect(run(env, "purge", "--force=no").exitCode).toBe(2);
    expect(JSON.parse(run(env, "list", "--json").stdout.toString()).accounts).toHaveLength(1);
  });

  test("provides account metadata for shell completion without usage requests", async () => {
    const { env } = await environment();
    addToken(env, "sk-ant-api-completion", "--email", "completion@example.com");
    run(env, "alias", "1", "work");

    const completion = run(env, "completion-accounts");
    expect(completion.exitCode).toBe(0);
    expect(completion.stdout.toString()).toBe("1:completion@example.com\nwork:completion@example.com (account 1)\n");
  });
});

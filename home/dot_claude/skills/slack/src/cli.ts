import { Command, Option } from "commander";
import { ExitCode, SlackCliError } from "./errors.ts";
import { setVerbose } from "./log.ts";
import { emitError } from "./output.ts";
import type { OutputFormat } from "./output.ts";
import type { CredentialStoreKind } from "./store/metadata.ts";
import { appManifestCommand } from "./commands/app.ts";
import { loginCommand } from "./commands/login.ts";
import { logoutCommand, ensureLogoutSelectorOk } from "./commands/logout.ts";
import { workspacesListCommand, workspacesSetDefaultCommand } from "./commands/workspaces.ts";
import { filesDownloadCommand } from "./commands/files.ts";
import { channelsFindCommand, usersFindCommand, usersProfileCommand } from "./commands/find.ts";
import { postCommand } from "./commands/post.ts";
import { readCommand } from "./commands/read.ts";
import { searchCommand } from "./commands/search.ts";
import { watchCommand } from "./commands/watch.ts";

const VERSION = "0.1.0";

export async function runCli(argv: string[]): Promise<number> {
  const program = new Command();
  program
    .name("slack-cli")
    .description("Slack CLI for AI agents")
    .version(VERSION, "--version")
    .addOption(new Option("--output <format>", "output format").choices(["json", "ndjson", "text"]).default("json"))
    .option("-v, --verbose", "enable verbose logging on stderr", false)
    .enablePositionalOptions()
    .exitOverride();

  const globalOpts = (): { output: OutputFormat } => {
    const opts = program.opts<{ output: OutputFormat; verbose: boolean }>();
    setVerbose(Boolean(opts.verbose));
    return { output: opts.output };
  };

  program
    .command("app")
    .description("manage the Slack app for slack-cli")
    .addCommand(
      new Command("manifest")
        .description("emit the canonical app manifest YAML")
        .option("--port <n>", "loopback redirect port", (v) => Number.parseInt(v, 10), 53682)
        .action((opts: { port: number }) => {
          appManifestCommand({ port: opts.port });
        }),
    );

  program
    .command("login")
    .description("authenticate against a Slack workspace via OAuth in the browser")
    .option("--port <n>", "loopback redirect port", (v) => Number.parseInt(v, 10), 53682)
    .option("--set-default", "set this workspace as the default", false)
    .addOption(
      new Option("--credential-store <kind>", "where to store secrets")
        .choices(["auto", "keychain", "file"])
        .default(process.env.SLACK_CLI_CREDENTIAL_STORE ?? "auto"),
    )
    .action(async (opts: {
      port: number;
      setDefault: boolean;
      credentialStore: CredentialStoreKind | "auto";
    }) => {
      const g = globalOpts();
      await loginCommand({
        port: opts.port,
        setDefault: opts.setDefault,
        credentialStore: opts.credentialStore,
        output: g.output,
      });
    });

  program
    .command("logout")
    .description("revoke and remove credentials for a workspace")
    .option("--workspace <w>", "workspace selector (id, domain, or name)")
    .option("--all", "remove all authenticated workspaces", false)
    .action(async (opts: { workspace?: string; all: boolean }) => {
      const g = globalOpts();
      const args = { workspace: opts.workspace, all: Boolean(opts.all), output: g.output };
      ensureLogoutSelectorOk(args);
      await logoutCommand(args);
    });

  const workspaces = program.command("workspaces").description("manage authenticated workspaces");
  workspaces
    .command("list")
    .description("list authenticated workspaces")
    .action(async () => {
      const g = globalOpts();
      await workspacesListCommand(g.output);
    });
  workspaces
    .command("set-default <selector>")
    .description("set the default workspace")
    .action(async (selector: string) => {
      const g = globalOpts();
      await workspacesSetDefaultCommand(selector, g.output);
    });

  program
    .command("post")
    .description("post, update, or delete a message")
    .requiredOption("--channel <id-or-name>", "channel ID, #name, or @user")
    .option("--text <text>", "message text")
    .option("--blocks <json>", "Block Kit JSON inline (use '-' for stdin)")
    .option("--blocks-file <path>", "Block Kit JSON from file")
    .option("--thread-ts <ts>", "post as a reply in this thread")
    .option("--broadcast", "broadcast the threaded reply to the channel", false)
    .option("--update <ts>", "edit an existing message")
    .option("--delete <ts>", "delete an existing message")
    .option("--metadata <json>", 'message metadata: {event_type, event_payload}')
    .option("--schedule <when>", "post at a future time: unix seconds, ISO 8601, or +1h/+30m/+2d")
    .option("--workspace <w>", "workspace selector")
    .action(async (opts: {
      channel: string;
      text?: string;
      blocks?: string;
      blocksFile?: string;
      threadTs?: string;
      broadcast: boolean;
      update?: string;
      delete?: string;
      metadata?: string;
      schedule?: string;
      workspace?: string;
    }) => {
      const g = globalOpts();
      const blocksStdin = opts.blocks === "-";
      await postCommand({
        channel: opts.channel,
        text: opts.text,
        blocks: blocksStdin ? undefined : opts.blocks,
        blocksFile: opts.blocksFile,
        blocksStdin,
        threadTs: opts.threadTs,
        broadcast: Boolean(opts.broadcast),
        updateTs: opts.update,
        deleteTs: opts.delete,
        metadata: opts.metadata,
        scheduleAt: opts.schedule,
        workspace: opts.workspace,
        output: g.output,
      });
    });

  const users = program.command("users").description("look up workspace members");
  users
    .command("find <query>")
    .description("find users by name, real name, display name, or email (substring match)")
    .option("--limit <n>", "max results", (v) => Number.parseInt(v, 10), 20)
    .option("--workspace <w>", "workspace selector")
    .action(async (query: string, opts: { limit: number; workspace?: string }) => {
      const g = globalOpts();
      await usersFindCommand({
        query,
        limit: opts.limit,
        workspace: opts.workspace,
        output: g.output,
      });
    });
  users
    .command("profile <user>")
    .description("get a user's full profile (status, timezone, custom fields). Accepts Uxxx, @handle, or email.")
    .option("--workspace <w>", "workspace selector")
    .action(async (user: string, opts: { workspace?: string }) => {
      const g = globalOpts();
      await usersProfileCommand({ user, workspace: opts.workspace, output: g.output });
    });

  const channels = program.command("channels").description("look up channels");
  channels
    .command("find <query>")
    .description("find channels by name (substring match)")
    .option("--limit <n>", "max results", (v) => Number.parseInt(v, 10), 20)
    .option("--include-archived", "include archived channels", false)
    .option("--workspace <w>", "workspace selector")
    .action(async (
      query: string,
      opts: { limit: number; includeArchived: boolean; workspace?: string },
    ) => {
      const g = globalOpts();
      await channelsFindCommand({
        query,
        limit: opts.limit,
        includeArchived: Boolean(opts.includeArchived),
        workspace: opts.workspace,
        output: g.output,
      });
    });

  const files = program.command("files").description("manage files attached to messages");
  files
    .command("download")
    .description("download a file attached to a message")
    .option("--file-id <id>", "Slack file id (Fxxx)")
    .option("--url <url>", "url_private of the file (alternative to --file-id)")
    .requiredOption("--out <path>", "destination file path")
    .option("--workspace <w>", "workspace selector")
    .action(async (opts: { fileId?: string; url?: string; out: string; workspace?: string }) => {
      const g = globalOpts();
      await filesDownloadCommand({
        fileId: opts.fileId,
        url: opts.url,
        out: opts.out,
        workspace: opts.workspace,
        output: g.output,
      });
    });

  program
    .command("read <permalink>")
    .description("fetch a message (or full thread) by permalink")
    .option("--workspace <w>", "workspace selector")
    .action(async (permalink: string, opts: { workspace?: string }) => {
      const g = globalOpts();
      await readCommand({
        permalink,
        workspace: opts.workspace,
        output: g.output,
      });
    });

  program
    .command("search <query>")
    .description("search messages or files")
    .option("--count <n>", "results per page (1–100)", (v) => Number.parseInt(v, 10), 20)
    .option("--cursor <c>", "pagination cursor")
    .addOption(new Option("--sort <s>", "sort by").choices(["score", "timestamp"]).default("score"))
    .addOption(new Option("--sort-dir <d>", "sort direction").choices(["asc", "desc"]).default("desc"))
    .option("--files", "search files instead of messages", false)
    .option("--workspace <w>", "workspace selector")
    .action(async (
      query: string,
      opts: {
        count: number;
        cursor?: string;
        sort: "score" | "timestamp";
        sortDir: "asc" | "desc";
        files: boolean;
        workspace?: string;
      },
    ) => {
      const g = globalOpts();
      await searchCommand({
        query,
        count: opts.count,
        cursor: opts.cursor,
        sort: opts.sort,
        sortDir: opts.sortDir,
        files: Boolean(opts.files),
        workspace: opts.workspace,
        output: g.output,
      });
    });

  const watch = program.command("watch").description("stream events as NDJSON");
  watch
    .command("mentions")
    .description("watch new mentions of the authenticated user")
    .option("--once", "perform a single poll and exit", false)
    .option("--timeout <duration>", "exit after this duration (e.g. 30s, 5m, 1h)", parseDuration)
    .option("--workspace <w>", "workspace selector")
    .action(async (opts: { once: boolean; timeout?: number; workspace?: string }) => {
      globalOpts();
      await watchCommand({
        kind: "mentions",
        once: Boolean(opts.once),
        timeout: opts.timeout,
        workspace: opts.workspace,
      });
    });
  watch
    .command("thread <channel> <thread-ts>")
    .description("watch new replies in a thread")
    .option("--once", "perform a single poll and exit", false)
    .option("--timeout <duration>", "exit after this duration", parseDuration)
    .option("--workspace <w>", "workspace selector")
    .action(async (channel: string, threadTs: string, opts: { once: boolean; timeout?: number; workspace?: string }) => {
      globalOpts();
      await watchCommand({
        kind: "thread",
        channel,
        threadTs,
        once: Boolean(opts.once),
        timeout: opts.timeout,
        workspace: opts.workspace,
      });
    });
  watch
    .command("channel <channel>")
    .description("watch new messages in a channel")
    .option("--once", "perform a single poll and exit", false)
    .option("--timeout <duration>", "exit after this duration", parseDuration)
    .option("--workspace <w>", "workspace selector")
    .action(async (channel: string, opts: { once: boolean; timeout?: number; workspace?: string }) => {
      globalOpts();
      await watchCommand({
        kind: "channel",
        channel,
        once: Boolean(opts.once),
        timeout: opts.timeout,
        workspace: opts.workspace,
      });
    });

  try {
    await program.parseAsync(argv);
    return ExitCode.Ok;
  } catch (err) {
    if (err instanceof SlackCliError) {
      emitError(err.toPayload());
      return err.exitCode;
    }
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "commander.helpDisplayed") {
      return ExitCode.Ok;
    }
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "commander.version") {
      return ExitCode.Ok;
    }
    if (err instanceof Error && "code" in err && typeof (err as { code?: string }).code === "string") {
      const code = (err as { code: string }).code;
      if (code.startsWith("commander.")) {
        emitError({ error: code, message: err.message });
        return ExitCode.Validation;
      }
    }
    emitError({
      error: "internal_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return ExitCode.Other;
  }
}

function parseDuration(v: string): number {
  const m = /^(\d+)(s|m|h)$/.exec(v);
  if (!m) {
    throw new SlackCliError({
      code: "invalid_arguments",
      message: `invalid duration '${v}'; use forms like 30s, 5m, 1h`,
      exitCode: ExitCode.Validation,
    });
  }
  const n = Number.parseInt(m[1]!, 10);
  switch (m[2]) {
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    default:
      return n;
  }
}

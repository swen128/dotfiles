import { ExitCode, SlackCliError } from "../errors.ts";
import { emit, type OutputFormat } from "../output.ts";
import { SlackClient } from "../slack/client.ts";
import { resolveChannel } from "../slack/resolve.ts";
import { resolveWorkspace } from "../store/store.ts";

const MAX_TEXT_LEN = 40000;
const MAX_UPDATE_TEXT_LEN = 4000;
const MAX_BLOCKS = 50;

export interface PostArgs {
  channel: string;
  text?: string | undefined;
  blocks?: string | undefined;
  blocksFile?: string | undefined;
  blocksStdin: boolean;
  threadTs?: string | undefined;
  broadcast: boolean;
  updateTs?: string | undefined;
  deleteTs?: string | undefined;
  metadata?: string | undefined;
  scheduleAt?: string | undefined;
  workspace?: string | undefined;
  output: OutputFormat;
}

export function parsePostAt(input: string): number {
  if (/^\d{10}$/.test(input)) return Number(input);
  if (/^\d{13}$/.test(input)) return Math.floor(Number(input) / 1000);
  if (/^\d+\.\d+$/.test(input)) return Math.floor(Number(input));
  const rel = /^\+(\d+)([smhd])$/.exec(input);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2]!;
    const sec = unit === "s" ? n : unit === "m" ? n * 60 : unit === "h" ? n * 3600 : n * 86400;
    return Math.floor(Date.now() / 1000) + sec;
  }
  const t = Date.parse(input);
  if (!Number.isNaN(t)) return Math.floor(t / 1000);
  throw new SlackCliError({
    code: "invalid_arguments",
    message: `--schedule '${input}' is not a recognised time (use unix seconds, ISO 8601, or +1h/+30m/+2d)`,
    exitCode: ExitCode.Validation,
  });
}

export async function postCommand(args: PostArgs): Promise<void> {
  const creds = await resolveWorkspace(args.workspace);
  const client = new SlackClient(creds);
  const channel = await resolveChannel(client, args.channel);

  if (args.deleteTs) {
    if (args.text || args.blocks || args.blocksFile || args.blocksStdin || args.updateTs) {
      throw new SlackCliError({
        code: "invalid_arguments",
        message: "--delete cannot be combined with --text/--blocks/--update",
        exitCode: ExitCode.Validation,
      });
    }
    const resp = await client.call<{ ok: true; channel: string; ts: string }>("chat.delete", {
      channel: channel.id,
      ts: args.deleteTs,
    });
    emit(args.output, { ok: true, deleted: { channel: resp.channel, ts: resp.ts } });
    return;
  }

  const blocks = await loadBlocks(args);
  if (blocks && blocks.length > MAX_BLOCKS) {
    throw new SlackCliError({
      code: "invalid_blocks",
      message: `blocks length ${blocks.length} exceeds Slack maximum of ${MAX_BLOCKS}`,
      exitCode: ExitCode.Validation,
    });
  }

  if (args.updateTs) {
    if (args.text && args.text.length > MAX_UPDATE_TEXT_LEN) {
      throw new SlackCliError({
        code: "msg_too_long",
        message: `text length ${args.text.length} exceeds chat.update limit of ${MAX_UPDATE_TEXT_LEN}`,
        exitCode: ExitCode.Validation,
      });
    }
    const params: Record<string, unknown> = {
      channel: channel.id,
      ts: args.updateTs,
    };
    if (args.text !== undefined) params.text = args.text;
    if (blocks) params.blocks = JSON.stringify(blocks);
    if (args.metadata) params.metadata = args.metadata;
    const resp = await client.call<{ ok: true; channel: string; ts: string; text?: string }>(
      "chat.update",
      params,
    );
    emit(args.output, { ok: true, updated: { channel: resp.channel, ts: resp.ts } });
    return;
  }

  if (!args.text && !blocks) {
    throw new SlackCliError({
      code: "no_text",
      message: "post requires --text or --blocks",
      exitCode: ExitCode.Validation,
    });
  }
  if (args.text && args.text.length > MAX_TEXT_LEN) {
    throw new SlackCliError({
      code: "msg_too_long",
      message: `text length ${args.text.length} exceeds chat.postMessage limit of ${MAX_TEXT_LEN}`,
      exitCode: ExitCode.Validation,
    });
  }

  const params: Record<string, unknown> = { channel: channel.id };
  if (args.text !== undefined) params.text = args.text;
  if (blocks) params.blocks = JSON.stringify(blocks);
  if (args.threadTs) params.thread_ts = args.threadTs;
  if (args.broadcast) {
    if (!args.threadTs) {
      throw new SlackCliError({
        code: "invalid_arguments",
        message: "--broadcast requires --thread-ts",
        exitCode: ExitCode.Validation,
      });
    }
    params.reply_broadcast = "true";
  }
  if (args.metadata) params.metadata = args.metadata;

  if (args.scheduleAt) {
    const postAt = parsePostAt(args.scheduleAt);
    if (postAt <= Math.floor(Date.now() / 1000)) {
      throw new SlackCliError({
        code: "invalid_arguments",
        message: `--schedule must be in the future (got ${new Date(postAt * 1000).toISOString()})`,
        exitCode: ExitCode.Validation,
      });
    }
    params.post_at = String(postAt);
    const resp = await client.call<{
      ok: true;
      channel: string;
      scheduled_message_id: string;
      post_at: number;
    }>("chat.scheduleMessage", params);
    emit(args.output, {
      ok: true,
      scheduled: {
        channel: resp.channel,
        scheduled_message_id: resp.scheduled_message_id,
        post_at: resp.post_at,
        post_at_iso: new Date(resp.post_at * 1000).toISOString(),
      },
    });
    return;
  }

  const resp = await client.call<{ ok: true; channel: string; ts: string }>("chat.postMessage", params);

  let permalink: string | undefined;
  try {
    const linkResp = await client.call<{ ok: true; permalink: string }>("chat.getPermalink", {
      channel: resp.channel,
      message_ts: resp.ts,
    });
    permalink = linkResp.permalink;
  } catch {}

  emit(args.output, { ok: true, channel: resp.channel, ts: resp.ts, permalink });
}

async function loadBlocks(args: PostArgs): Promise<unknown[] | null> {
  const sources = [args.blocks, args.blocksFile, args.blocksStdin].filter(Boolean).length;
  if (sources === 0) return null;
  if (sources > 1) {
    throw new SlackCliError({
      code: "invalid_arguments",
      message: "specify only one of --blocks, --blocks-file, --blocks -",
      exitCode: ExitCode.Validation,
    });
  }
  let raw: string;
  if (args.blocks) raw = args.blocks;
  else if (args.blocksFile) raw = await Bun.file(args.blocksFile).text();
  else raw = await readStdin();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SlackCliError({
      code: "invalid_blocks_format",
      message: `--blocks is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: ExitCode.Validation,
    });
  }
  if (!Array.isArray(parsed)) {
    throw new SlackCliError({
      code: "invalid_blocks_format",
      message: "--blocks must be a JSON array",
      exitCode: ExitCode.Validation,
    });
  }
  return parsed;
}

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(buf);
}

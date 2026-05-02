import { ExitCode, SlackCliError } from "../errors.ts";
import { emit, type OutputFormat } from "../output.ts";
import { SlackClient } from "../slack/client.ts";
import { channelName, userName } from "../slack/resolve.ts";
import { resolveWorkspace } from "../store/store.ts";

export interface ReadArgs {
  permalink: string;
  workspace?: string | undefined;
  output: OutputFormat;
}

interface SlackFile {
  id: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
  permalink_public?: string;
  thumb_360?: string;
  thumb_480?: string;
}

interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  thread_ts?: string;
  blocks?: unknown;
  attachments?: unknown;
  files?: SlackFile[];
  subtype?: string;
  reply_count?: number;
  permalink?: string;
}

export async function readCommand(args: ReadArgs): Promise<void> {
  const target = parsePermalink(args.permalink);
  const creds = await resolveWorkspace(args.workspace);
  const client = new SlackClient(creds);

  const messages = target.threadTs
    ? await fetchThread(client, target.channel, target.threadTs)
    : await fetchSingle(client, target.channel, target.ts);

  const enriched = await Promise.all(
    messages.map(async (m) => ({
      ts: m.ts,
      user: { id: m.user, name: m.user ? await userName(client, m.user) : null },
      text: m.text,
      thread_ts: m.thread_ts,
      subtype: m.subtype,
      reply_count: m.reply_count,
      blocks: m.blocks,
      attachments: m.attachments,
      files: m.files?.map(projectFile),
    })),
  );

  const channel = {
    id: target.channel,
    name: await channelName(client, target.channel),
  };

  emit(args.output, {
    ok: true,
    channel,
    thread_ts: target.threadTs ?? null,
    messages: enriched,
  });
}

interface ResolvedTarget {
  channel: string;
  ts: string;
  threadTs: string | null;
}

const PERMALINK_RE = /^\/archives\/([CGD][A-Z0-9]+)\/p(\d{16,})$/;

export function parsePermalink(input: string): ResolvedTarget {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SlackCliError({
      code: "invalid_arguments",
      message: `not a valid URL: ${input}`,
      exitCode: ExitCode.Validation,
    });
  }
  if (!/\.slack\.com$/.test(url.hostname)) {
    throw new SlackCliError({
      code: "invalid_arguments",
      message: `not a Slack permalink (host: ${url.hostname})`,
      exitCode: ExitCode.Validation,
    });
  }
  const match = PERMALINK_RE.exec(url.pathname);
  if (!match) {
    throw new SlackCliError({
      code: "invalid_arguments",
      message: `not a Slack message permalink: ${url.pathname}`,
      exitCode: ExitCode.Validation,
    });
  }
  const channel = match[1]!;
  const pts = match[2]!;
  const ts = `${pts.slice(0, -6)}.${pts.slice(-6)}`;
  const threadTsParam = url.searchParams.get("thread_ts");
  return {
    channel,
    ts,
    threadTs: threadTsParam ?? null,
  };
}

function projectFile(f: SlackFile): SlackFile {
  return {
    id: f.id,
    name: f.name,
    title: f.title,
    mimetype: f.mimetype,
    filetype: f.filetype,
    size: f.size,
    url_private: f.url_private,
    url_private_download: f.url_private_download,
    permalink: f.permalink,
    permalink_public: f.permalink_public,
    thumb_360: f.thumb_360,
    thumb_480: f.thumb_480,
  };
}

async function fetchSingle(client: SlackClient, channel: string, ts: string): Promise<SlackMessage[]> {
  const resp = await client.call<{ ok: true; messages?: SlackMessage[] }>("conversations.history", {
    channel,
    oldest: ts,
    latest: ts,
    inclusive: "true",
    limit: "1",
  });
  const m = resp.messages?.[0];
  if (!m) {
    throw new SlackCliError({
      code: "message_not_found",
      message: `no message at ts=${ts} in channel ${channel}`,
      exitCode: ExitCode.NotFound,
    });
  }
  return [m];
}

async function fetchThread(
  client: SlackClient,
  channel: string,
  threadTs: string,
): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  for await (const m of client.paginate<SlackMessage>(
    "conversations.replies",
    { channel, ts: threadTs, limit: 200 },
    (r) => r.messages as SlackMessage[] | undefined,
  )) {
    messages.push(m);
  }
  if (messages.length === 0) {
    throw new SlackCliError({
      code: "thread_not_found",
      message: `no thread at ts=${threadTs} in channel ${channel}`,
      exitCode: ExitCode.NotFound,
    });
  }
  return messages;
}

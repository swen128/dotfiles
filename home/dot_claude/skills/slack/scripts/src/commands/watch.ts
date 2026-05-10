import { ExitCode, SlackCliError } from "../errors.ts";
import { emitStream } from "../output.ts";
import { SlackClient } from "../slack/client.ts";
import { channelName, resolveChannel, userName } from "../slack/resolve.ts";
import { resolveWorkspace } from "../store/store.ts";

const POLL_INTERVAL_MS = 30_000;

export interface WatchCommonArgs {
  once: boolean;
  timeout?: number | undefined;
  workspace?: string | undefined;
}

export type WatchArgs =
  | (WatchCommonArgs & { kind: "mentions" })
  | (WatchCommonArgs & { kind: "thread"; channel: string; threadTs: string })
  | (WatchCommonArgs & { kind: "channel"; channel: string });

export async function watchCommand(args: WatchArgs): Promise<void> {
  const creds = await resolveWorkspace(args.workspace);
  const client = new SlackClient(creds);

  const stop = installSignals();
  const overallTimeout = args.timeout ? setTimeout(() => stop.signal(), args.timeout * 1000) : null;

  const startTs = nowTs();
  let lastSeenTs = startTs;

  const poll = async (): Promise<void> => {
    if (args.kind === "mentions") {
      lastSeenTs = await pollMentions(client, lastSeenTs);
    } else if (args.kind === "thread") {
      const channel = await resolveChannel(client, args.channel);
      lastSeenTs = await pollThread(client, channel.id, args.threadTs, lastSeenTs);
    } else {
      const channel = await resolveChannel(client, args.channel);
      lastSeenTs = await pollChannel(client, channel.id, lastSeenTs);
    }
  };

  if (args.once) {
    await poll();
    if (overallTimeout) clearTimeout(overallTimeout);
    return;
  }

  const RETRYABLE: ReadonlySet<number> = new Set([ExitCode.Network, ExitCode.SlackInternal, ExitCode.RateLimit]);
  let backoff = 0;
  while (!stop.aborted) {
    try {
      await poll();
      backoff = 0;
    } catch (err) {
      if (err instanceof SlackCliError && RETRYABLE.has(err.exitCode)) {
        backoff = Math.min(backoff === 0 ? 1000 : backoff * 2, 60_000);
        process.stderr.write(`[watch] transient error: ${err.message}; retrying in ${backoff}ms\n`);
        await sleepCancelable(backoff, stop);
        continue;
      }
      throw err;
    }
    await sleepCancelable(POLL_INTERVAL_MS, stop);
  }
  if (overallTimeout) clearTimeout(overallTimeout);
}

async function pollMentions(client: SlackClient, lastSeenTs: string): Promise<string> {
  const query = `<@${client.credentials.user_id}>`;
  const resp = await client.call<{
    ok: true;
    messages?: {
      matches: Array<{
        ts: string;
        user?: string;
        username?: string;
        channel?: { id: string; name?: string };
        text?: string;
        permalink?: string;
        thread_ts?: string;
      }>;
    };
  }>("search.messages", { query, sort: "timestamp", sort_dir: "desc", count: "100", cursor: "*" });
  const matches = (resp.messages?.matches ?? []).filter((m) => compareTs(m.ts, lastSeenTs) > 0);
  matches.sort((a, b) => compareTs(a.ts, b.ts));
  let next = lastSeenTs;
  for (const m of matches) {
    const cid = m.channel?.id;
    const isDm = cid ? /^D[A-Z0-9]+$/.test(cid) : false;
    const resolvedChannelName = cid
      ? isDm
        ? await channelName(client, cid)
        : (m.channel?.name ?? (await channelName(client, cid)))
      : null;
    const channel = { id: cid, name: resolvedChannelName };
    const user = {
      id: m.user,
      name: m.username ?? (m.user ? await userName(client, m.user) : null),
    };
    emitStream({
      kind: "mention",
      channel,
      user,
      ts: m.ts,
      thread_ts: m.thread_ts,
      permalink: m.permalink,
      text: m.text,
      team_id: client.credentials.team_id,
    });
    if (compareTs(m.ts, next) > 0) next = m.ts;
  }
  return next;
}

async function pollThread(
  client: SlackClient,
  channelId: string,
  threadTs: string,
  lastSeenTs: string,
): Promise<string> {
  const oldest = compareTs(lastSeenTs, threadTs) > 0 ? lastSeenTs : threadTs;
  const resp = await client.call<{
    ok: true;
    messages?: Array<{ ts: string; user?: string; text?: string; thread_ts?: string }>;
  }>("conversations.replies", {
    channel: channelId,
    ts: threadTs,
    oldest,
    inclusive: "false",
    limit: "200",
  });
  const items = (resp.messages ?? []).filter((m) => compareTs(m.ts, lastSeenTs) > 0 && m.ts !== threadTs);
  items.sort((a, b) => compareTs(a.ts, b.ts));
  let next = lastSeenTs;
  for (const m of items) {
    emitStream({
      kind: "thread_reply",
      channel: { id: channelId },
      thread_ts: threadTs,
      user: { id: m.user, name: m.user ? await userName(client, m.user) : null },
      ts: m.ts,
      text: m.text,
      permalink: buildPermalink(client.credentials.team_domain, channelId, m.ts, threadTs),
      team_id: client.credentials.team_id,
    });
    if (compareTs(m.ts, next) > 0) next = m.ts;
  }
  return next;
}

function buildPermalink(
  teamDomain: string,
  channelId: string,
  ts: string,
  threadTs?: string,
): string {
  const pts = "p" + ts.replace(".", "");
  const base = `https://${teamDomain}.slack.com/archives/${channelId}/${pts}`;
  return threadTs && threadTs !== ts
    ? `${base}?thread_ts=${threadTs}&cid=${channelId}`
    : base;
}

async function pollChannel(client: SlackClient, channelId: string, lastSeenTs: string): Promise<string> {
  const resp = await client.call<{
    ok: true;
    messages?: Array<{ ts: string; user?: string; text?: string; subtype?: string; thread_ts?: string }>;
  }>("conversations.history", {
    channel: channelId,
    oldest: lastSeenTs,
    inclusive: "false",
    limit: "200",
  });
  const items = (resp.messages ?? []).filter((m) => compareTs(m.ts, lastSeenTs) > 0);
  items.sort((a, b) => compareTs(a.ts, b.ts));
  let next = lastSeenTs;
  for (const m of items) {
    emitStream({
      kind: "channel_message",
      channel: { id: channelId },
      user: { id: m.user, name: m.user ? await userName(client, m.user) : null },
      ts: m.ts,
      thread_ts: m.thread_ts,
      subtype: m.subtype,
      text: m.text,
      permalink: buildPermalink(client.credentials.team_domain, channelId, m.ts, m.thread_ts),
      team_id: client.credentials.team_id,
    });
    if (compareTs(m.ts, next) > 0) next = m.ts;
  }
  return next;
}

function nowTs(): string {
  const ms = Date.now();
  const seconds = Math.floor(ms / 1000);
  const micro = (ms % 1000) * 1000;
  return `${seconds}.${String(micro).padStart(6, "0")}`;
}

function compareTs(a: string, b: string): number {
  const af = parseFloat(a);
  const bf = parseFloat(b);
  if (af === bf) return 0;
  return af < bf ? -1 : 1;
}

interface StopHandle {
  readonly aborted: boolean;
  signal(): void;
  onSignal(cb: () => void): void;
}

function installSignals(): StopHandle {
  let aborted = false;
  const callbacks: Array<() => void> = [];
  const handler = (): void => {
    if (aborted) return;
    aborted = true;
    for (const cb of callbacks) cb();
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
  return {
    get aborted() {
      return aborted;
    },
    signal: handler,
    onSignal: (cb) => callbacks.push(cb),
  };
}

function sleepCancelable(ms: number, stop: StopHandle): Promise<void> {
  return new Promise((resolve) => {
    if (stop.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    stop.onSignal(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

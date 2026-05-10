import { ExitCode, SlackCliError } from "../errors.ts";
import { emit, type OutputFormat } from "../output.ts";
import { SlackClient } from "../slack/client.ts";
import { channelName, userName } from "../slack/resolve.ts";
import { resolveWorkspace } from "../store/store.ts";

export interface SearchArgs {
  query: string;
  count: number;
  cursor?: string | undefined;
  sort: "score" | "timestamp";
  sortDir: "asc" | "desc";
  files: boolean;
  workspace?: string | undefined;
  output: OutputFormat;
}

interface SearchMessageMatch {
  iid?: string;
  ts: string;
  user?: string;
  username?: string;
  channel?: { id: string; name?: string };
  text?: string;
  permalink?: string;
}

interface SearchFilesMatch {
  id: string;
  name: string;
  title?: string;
  user?: string;
  username?: string;
  permalink?: string;
  filetype?: string;
  created?: number;
}

interface SearchResponse {
  ok: boolean;
  error?: string;
  needed?: string;
  messages?: { matches: SearchMessageMatch[]; pagination?: { total_count?: number } };
  files?: { matches: SearchFilesMatch[]; pagination?: { total_count?: number } };
  response_metadata?: { next_cursor?: string; messages?: string[]; warnings?: string[] };
  [key: string]: unknown;
}

export async function searchCommand(args: SearchArgs): Promise<void> {
  if (args.count < 1 || args.count > 100) {
    throw new SlackCliError({
      code: "invalid_arguments",
      message: `--count must be between 1 and 100`,
      exitCode: ExitCode.Validation,
    });
  }
  const creds = await resolveWorkspace(args.workspace);
  const client = new SlackClient(creds);

  const params: Record<string, unknown> = {
    query: args.query,
    count: String(args.count),
    sort: args.sort,
    sort_dir: args.sortDir,
    cursor: args.cursor ?? "*",
  };

  const method = args.files ? "search.files" : "search.messages";
  const resp = await client.call<SearchResponse>(method, params);
  const nextCursor = resp.response_metadata?.next_cursor || undefined;

  if (args.files) {
    const matches = resp.files?.matches ?? [];
    const out = await Promise.all(
      matches.map(async (m) => ({
        id: m.id,
        name: m.name,
        title: m.title,
        user: { id: m.user, name: m.username ?? (m.user ? await userName(client, m.user) : null) },
        permalink: m.permalink,
        filetype: m.filetype,
        created: m.created,
      })),
    );
    emit(args.output, { ok: true, total: resp.files?.pagination?.total_count, next_cursor: nextCursor, files: out });
    return;
  }

  const matches = resp.messages?.matches ?? [];
  const out = await Promise.all(
    matches.map(async (m) => ({
      channel: {
        id: m.channel?.id,
        name: m.channel?.name ?? (m.channel?.id ? await channelName(client, m.channel.id) : null),
      },
      user: { id: m.user, name: m.username ?? (m.user ? await userName(client, m.user) : null) },
      ts: m.ts,
      permalink: m.permalink,
      text: m.text,
    })),
  );
  emit(args.output, { ok: true, total: resp.messages?.pagination?.total_count, next_cursor: nextCursor, messages: out });
}

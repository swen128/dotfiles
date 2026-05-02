import { ExitCode, SlackCliError } from "../errors.ts";
import { emit, type OutputFormat } from "../output.ts";
import { SlackClient } from "../slack/client.ts";
import { findChannels, findUsers } from "../slack/resolve.ts";
import { resolveWorkspace } from "../store/store.ts";

export interface UsersFindArgs {
  query: string;
  limit: number;
  workspace?: string | undefined;
  output: OutputFormat;
}

export async function usersFindCommand(args: UsersFindArgs): Promise<void> {
  const creds = await resolveWorkspace(args.workspace);
  const client = new SlackClient(creds);
  const matches = await findUsers(client, args.query, args.limit);
  emit(args.output, { ok: true, total: matches.length, users: matches });
}

export interface UsersProfileArgs {
  user: string;
  workspace?: string | undefined;
  output: OutputFormat;
}

export async function usersProfileCommand(args: UsersProfileArgs): Promise<void> {
  const creds = await resolveWorkspace(args.workspace);
  const client = new SlackClient(creds);
  const userId = await resolveUserId(client, args.user);
  const resp = await client.call<{ ok: true; profile: Record<string, unknown> }>(
    "users.profile.get",
    { user: userId, include_labels: "true" },
  );
  emit(args.output, { ok: true, user_id: userId, profile: resp.profile });
}

async function resolveUserId(client: SlackClient, selector: string): Promise<string> {
  if (/^[UW][A-Z0-9]+$/.test(selector)) return selector;
  const handle = selector.replace(/^@/, "");
  const matches = await findUsers(client, handle, 100);
  const exact = matches.find((u) => u.name === handle || u.email === handle);
  if (exact) return exact.id;
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length === 0) {
    throw new SlackCliError({
      code: "user_not_found",
      message: `no user matches '${selector}'`,
      exitCode: ExitCode.NotFound,
    });
  }
  throw new SlackCliError({
    code: "user_ambiguous",
    message: `'${selector}' matched ${matches.length} users; pass a Uxxx id`,
    exitCode: ExitCode.Validation,
  });
}

export interface ChannelsFindArgs {
  query: string;
  limit: number;
  includeArchived: boolean;
  workspace?: string | undefined;
  output: OutputFormat;
}

export async function channelsFindCommand(args: ChannelsFindArgs): Promise<void> {
  const creds = await resolveWorkspace(args.workspace);
  const client = new SlackClient(creds);
  const matches = await findChannels(client, args.query, args.limit, args.includeArchived);
  emit(args.output, { ok: true, total: matches.length, channels: matches });
}

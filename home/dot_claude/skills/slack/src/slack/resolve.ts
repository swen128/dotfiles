import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ExitCode, SlackCliError } from "../errors.ts";
import { teamCacheDir } from "../paths.ts";
import { SlackClient } from "./client.ts";

interface ChannelEntry {
  id: string;
  name: string;
  is_archived?: boolean;
}

interface UserEntry {
  id: string;
  name: string;
  real_name?: string;
  display_name?: string;
  email?: string;
  is_bot?: boolean;
  deleted?: boolean;
}

interface ChannelCache {
  fetched_at: number;
  channels: ChannelEntry[];
}

interface UserCache {
  fetched_at: number;
  users: UserEntry[];
}

const TTL_MS = 24 * 60 * 60 * 1000;

export async function resolveChannel(client: SlackClient, selector: string): Promise<{ id: string; name: string }> {
  if (/^[CGD][A-Z0-9]+$/.test(selector)) {
    return { id: selector, name: selector };
  }
  const wanted = selector.replace(/^#/, "");
  const dmHandle = selector.startsWith("@") ? selector.slice(1) : null;
  if (dmHandle) {
    return resolveDm(client, dmHandle);
  }
  const cache = await loadChannelCache(client, false);
  const hit = cache.channels.find((c) => c.name === wanted && !c.is_archived);
  if (hit) return { id: hit.id, name: hit.name };
  const refreshed = await loadChannelCache(client, true);
  const hit2 = refreshed.channels.find((c) => c.name === wanted && !c.is_archived);
  if (hit2) return { id: hit2.id, name: hit2.name };
  throw new SlackCliError({
    code: "channel_not_found",
    message: `channel '${selector}' not found`,
    exitCode: ExitCode.NotFound,
  });
}

const dmNameMemo = new Map<string, string | null>();

export async function channelName(client: SlackClient, id: string): Promise<string | null> {
  if (/^[CG][A-Z0-9]+$/.test(id)) {
    const cache = await loadChannelCache(client, false);
    const hit = cache.channels.find((c) => c.id === id);
    return hit ? hit.name : null;
  }
  if (/^D[A-Z0-9]+$/.test(id)) {
    const memoKey = `${client.credentials.team_id}:${id}`;
    if (dmNameMemo.has(memoKey)) return dmNameMemo.get(memoKey) ?? null;
    try {
      const info = await client.call<{ ok: true; channel: { user?: string } }>(
        "conversations.info",
        { channel: id },
      );
      const userId = info.channel?.user;
      if (!userId) {
        dmNameMemo.set(memoKey, null);
        return null;
      }
      const name = await userName(client, userId);
      const resolved = name ? `@${name}` : `@${userId}`;
      dmNameMemo.set(memoKey, resolved);
      return resolved;
    } catch {
      dmNameMemo.set(memoKey, null);
      return null;
    }
  }
  return null;
}

export async function userName(client: SlackClient, id: string): Promise<string | null> {
  if (!/^[UW][A-Z0-9]+$/.test(id)) return null;
  const cache = await loadUserCache(client, false);
  const hit = cache.users.find((u) => u.id === id);
  return hit ? hit.real_name ?? hit.name : null;
}

async function resolveDm(client: SlackClient, handle: string): Promise<{ id: string; name: string }> {
  const users = await loadUserCache(client, false);
  let user = users.users.find((u) => u.name === handle);
  if (!user) {
    const refreshed = await loadUserCache(client, true);
    user = refreshed.users.find((u) => u.name === handle);
  }
  if (!user) {
    throw new SlackCliError({
      code: "user_not_found",
      message: `user '@${handle}' not found`,
      exitCode: ExitCode.NotFound,
    });
  }
  const opened = await client.call<{ ok: true; channel: { id: string } }>("conversations.open", {
    users: user.id,
    return_im: true,
  });
  return { id: opened.channel.id, name: `@${user.name}` };
}

async function loadChannelCache(client: SlackClient, force: boolean): Promise<ChannelCache> {
  const path = cachePath(client, "channels.json");
  if (!force) {
    const fresh = await readCache<ChannelCache>(path);
    if (fresh) return fresh;
  }
  const channels: ChannelEntry[] = [];
  for await (const ch of client.paginate<ChannelEntry>(
    "conversations.list",
    { types: "public_channel,private_channel,mpim", exclude_archived: false, limit: 1000 },
    (r) => r.channels as ChannelEntry[] | undefined,
  )) {
    channels.push({ id: ch.id, name: ch.name, is_archived: ch.is_archived });
  }
  const cache: ChannelCache = { fetched_at: Date.now(), channels };
  await writeCache(path, cache);
  return cache;
}

async function loadUserCache(client: SlackClient, force: boolean): Promise<UserCache> {
  const path = cachePath(client, "users.json");
  if (!force) {
    const fresh = await readCache<UserCache>(path);
    if (fresh) return fresh;
  }
  interface RawUser extends UserEntry {
    profile?: {
      real_name?: string;
      display_name?: string;
      email?: string;
    };
  }
  const users: UserEntry[] = [];
  for await (const u of client.paginate<RawUser>(
    "users.list",
    { limit: 200 },
    (r) => r.members as RawUser[] | undefined,
  )) {
    users.push({
      id: u.id,
      name: u.name,
      real_name: u.real_name ?? u.profile?.real_name,
      display_name: u.profile?.display_name,
      email: u.profile?.email,
      is_bot: u.is_bot,
      deleted: u.deleted,
    });
  }
  const cache: UserCache = { fetched_at: Date.now(), users };
  await writeCache(path, cache);
  return cache;
}

export interface UserMatch {
  id: string;
  name: string;
  real_name: string | null;
  display_name: string | null;
  email: string | null;
  is_bot: boolean;
  deleted: boolean;
}

export async function findUsers(
  client: SlackClient,
  query: string,
  limit: number,
): Promise<UserMatch[]> {
  const q = query.toLowerCase().replace(/^@/, "");
  const cache = await loadUserCache(client, false);
  return cache.users
    .filter((u) => !u.deleted)
    .filter((u) => {
      const haystack = [u.name, u.real_name, u.display_name, u.email]
        .filter((s): s is string => Boolean(s))
        .map((s) => s.toLowerCase());
      return haystack.some((h) => h.includes(q));
    })
    .slice(0, limit)
    .map((u) => ({
      id: u.id,
      name: u.name,
      real_name: u.real_name ?? null,
      display_name: u.display_name ?? null,
      email: u.email ?? null,
      is_bot: u.is_bot ?? false,
      deleted: u.deleted ?? false,
    }));
}

export interface ChannelMatch {
  id: string;
  name: string;
  is_archived: boolean;
}

export async function findChannels(
  client: SlackClient,
  query: string,
  limit: number,
  includeArchived: boolean,
): Promise<ChannelMatch[]> {
  const q = query.toLowerCase().replace(/^#/, "");
  const cache = await loadChannelCache(client, false);
  return cache.channels
    .filter((c) => includeArchived || !c.is_archived)
    .filter((c) => c.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      name: c.name,
      is_archived: c.is_archived ?? false,
    }));
}

function cachePath(client: SlackClient, name: string): string {
  return join(teamCacheDir(client.credentials.team_id), name);
}

async function readCache<T extends { fetched_at: number }>(path: string): Promise<T | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    const data = (await file.json()) as T;
    if (Date.now() - data.fetched_at > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeCache(path: string, data: unknown): Promise<void> {
  const fs = await import("node:path");
  await mkdir(fs.dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(data));
}

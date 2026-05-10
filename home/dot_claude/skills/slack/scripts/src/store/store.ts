import { SlackCliError, ExitCode } from "../errors.ts";
import { OsKeychain, type KeychainSecret } from "./keychain.ts";
import { withLock } from "./lock.ts";
import {
  readMetadata,
  writeMetadata,
  type CredentialStoreKind,
  type MetadataFile,
  type WorkspaceMetadata,
} from "./metadata.ts";

export interface WorkspaceCredentials {
  team_id: string;
  team_name: string;
  team_domain: string;
  user_id: string;
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  logged_in_at: string;
}

export interface PutOptions {
  setDefault: boolean;
}

export interface ResolveResult {
  credentials: WorkspaceCredentials;
}

const keychain = new OsKeychain();

export async function listWorkspaces(): Promise<{
  default_workspace: string | null;
  workspaces: WorkspaceMetadata[];
  credential_store: CredentialStoreKind;
}> {
  const meta = await readMetadata();
  return {
    default_workspace: meta.default_workspace,
    workspaces: Object.values(meta.workspaces),
    credential_store: meta.credential_store,
  };
}

export async function getCredentialStoreKind(): Promise<CredentialStoreKind> {
  const meta = await readMetadata();
  return meta.credential_store;
}

export async function setDefault(teamId: string): Promise<void> {
  await withLock(async () => {
    const meta = await readMetadata();
    if (!(teamId in meta.workspaces)) {
      throw new SlackCliError({
        code: "workspace_not_authenticated",
        message: `workspace ${teamId} is not authenticated`,
        exitCode: ExitCode.Auth,
      });
    }
    meta.default_workspace = teamId;
    await writeMetadata(meta);
  });
}

export async function getCredentials(teamId: string): Promise<WorkspaceCredentials | null> {
  const meta = await readMetadata();
  const md = meta.workspaces[teamId];
  if (!md) return null;
  if (meta.credential_store === "keychain") {
    const secret = keychain.get(teamId);
    if (!secret) return null;
    return mergeCredentials(md, secret);
  }
  if (!md.access_token || !md.refresh_token || !md.client_secret) return null;
  return mergeCredentials(md, {
    access_token: md.access_token,
    refresh_token: md.refresh_token,
    client_secret: md.client_secret,
  });
}

export async function putCredentials(
  creds: WorkspaceCredentials,
  options: PutOptions,
  storeKind: CredentialStoreKind,
): Promise<void> {
  await withLock(async () => {
    const meta = await readMetadata();
    if (Object.keys(meta.workspaces).length > 0 && meta.credential_store !== storeKind) {
      throw new SlackCliError({
        code: "credential_store_mismatch",
        message: `existing workspaces use credential_store=${meta.credential_store}; cannot mix with ${storeKind}`,
        exitCode: ExitCode.Validation,
      });
    }
    meta.credential_store = storeKind;

    const md: WorkspaceMetadata = {
      team_id: creds.team_id,
      team_name: creds.team_name,
      team_domain: creds.team_domain,
      user_id: creds.user_id,
      client_id: creds.client_id,
      expires_at: creds.expires_at,
      logged_in_at: creds.logged_in_at,
    };
    if (storeKind === "file") {
      md.access_token = creds.access_token;
      md.refresh_token = creds.refresh_token;
      md.client_secret = creds.client_secret;
    } else {
      keychain.set(creds.team_id, {
        access_token: creds.access_token,
        refresh_token: creds.refresh_token,
        client_secret: creds.client_secret,
      });
    }
    meta.workspaces[creds.team_id] = md;
    if (options.setDefault || meta.default_workspace === null) {
      meta.default_workspace = creds.team_id;
    }
    await writeMetadata(meta);
  });
}

export async function updateTokens(
  teamId: string,
  next: { access_token: string; refresh_token: string; expires_at: string },
): Promise<void> {
  await withLock(async () => {
    const meta = await readMetadata();
    const md = meta.workspaces[teamId];
    if (!md) {
      throw new SlackCliError({
        code: "workspace_not_authenticated",
        message: `workspace ${teamId} is not authenticated`,
        exitCode: ExitCode.Auth,
      });
    }
    md.expires_at = next.expires_at;
    if (meta.credential_store === "file") {
      md.access_token = next.access_token;
      md.refresh_token = next.refresh_token;
    } else {
      const secret = keychain.get(teamId);
      if (!secret) {
        throw new SlackCliError({
          code: "credentials_missing",
          message: `keychain entry for ${teamId} is missing`,
          exitCode: ExitCode.Auth,
        });
      }
      keychain.set(teamId, {
        ...secret,
        access_token: next.access_token,
        refresh_token: next.refresh_token,
      });
    }
    await writeMetadata(meta);
  });
}

export async function deleteWorkspace(teamId: string): Promise<{ removed: boolean; promoted: string | null }> {
  return withLock(async () => {
    const meta = await readMetadata();
    if (!(teamId in meta.workspaces)) {
      return { removed: false, promoted: null };
    }
    delete meta.workspaces[teamId];
    if (meta.credential_store === "keychain") {
      keychain.delete(teamId);
    }
    let promoted: string | null = null;
    if (meta.default_workspace === teamId) {
      const remaining = Object.values(meta.workspaces);
      if (remaining.length === 0) {
        meta.default_workspace = null;
      } else {
        const newest = remaining.sort((a, b) =>
          a.logged_in_at < b.logged_in_at ? 1 : -1,
        )[0]!;
        meta.default_workspace = newest.team_id;
        promoted = newest.team_id;
      }
    }
    await writeMetadata(meta);
    return { removed: true, promoted };
  });
}

export async function resolveWorkspace(selector: string | undefined): Promise<WorkspaceCredentials> {
  const meta = await readMetadata();
  const all = Object.values(meta.workspaces);
  if (all.length === 0) {
    throw new SlackCliError({
      code: "no_workspaces_authenticated",
      message: "no workspaces are authenticated; run `slack-cli login`",
      exitCode: ExitCode.Auth,
    });
  }
  let teamId: string;
  if (selector) {
    const matches = all.filter(
      (w) =>
        w.team_id === selector ||
        w.team_domain === selector ||
        w.team_name === selector,
    );
    if (matches.length === 0) {
      throw new SlackCliError({
        code: "workspace_not_found",
        message: `no authenticated workspace matches '${selector}'. Authenticated: ${all
          .map((w) => `${w.team_domain}(${w.team_id})`)
          .join(", ")}`,
        exitCode: ExitCode.NotFound,
      });
    }
    if (matches.length > 1) {
      throw new SlackCliError({
        code: "workspace_ambiguous",
        message: `'${selector}' matches multiple workspaces: ${matches
          .map((w) => `${w.team_domain}(${w.team_id})`)
          .join(", ")}. Use --workspace <team_id>.`,
        exitCode: ExitCode.Validation,
      });
    }
    teamId = matches[0]!.team_id;
  } else {
    if (!meta.default_workspace) {
      throw new SlackCliError({
        code: "no_default_workspace",
        message: "no default workspace; pass --workspace or run `slack-cli workspaces set-default`",
        exitCode: ExitCode.Auth,
      });
    }
    teamId = meta.default_workspace;
  }
  const creds = await getCredentials(teamId);
  if (!creds) {
    throw new SlackCliError({
      code: "credentials_missing",
      message: `credentials for ${teamId} are missing; run \`slack-cli login\``,
      exitCode: ExitCode.Auth,
    });
  }
  return creds;
}

function mergeCredentials(md: WorkspaceMetadata, secret: KeychainSecret): WorkspaceCredentials {
  return {
    team_id: md.team_id,
    team_name: md.team_name,
    team_domain: md.team_domain,
    user_id: md.user_id,
    client_id: md.client_id,
    client_secret: secret.client_secret,
    access_token: secret.access_token,
    refresh_token: secret.refresh_token,
    expires_at: md.expires_at,
    logged_in_at: md.logged_in_at,
  };
}

import { chmod, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { metadataPath } from "../paths.ts";

export type CredentialStoreKind = "keychain" | "file";

export interface WorkspaceMetadata {
  team_id: string;
  team_name: string;
  team_domain: string;
  user_id: string;
  client_id: string;
  expires_at: string | null;
  logged_in_at: string;
  access_token?: string;
  refresh_token?: string | null;
  client_secret?: string;
}

export interface MetadataFile {
  version: 1;
  credential_store: CredentialStoreKind;
  default_workspace: string | null;
  workspaces: Record<string, WorkspaceMetadata>;
}

export async function readMetadata(): Promise<MetadataFile> {
  const path = metadataPath();
  const file = Bun.file(path);
  const exists = await file.exists();
  if (!exists) {
    return {
      version: 1,
      credential_store: "keychain",
      default_workspace: null,
      workspaces: {},
    };
  }
  const data = (await file.json()) as MetadataFile;
  if (data.version !== 1) {
    throw new Error(`Unsupported metadata version ${data.version} at ${path}`);
  }
  return data;
}

export async function writeMetadata(data: MetadataFile): Promise<void> {
  const path = metadataPath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  await Bun.write(tmp, JSON.stringify(data, null, 2));
  try {
    await chmod(tmp, 0o600);
  } catch {}
  await rename(tmp, path);
}

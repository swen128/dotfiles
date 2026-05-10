import { homedir, platform } from "node:os";
import { join } from "node:path";

const APP = "slack-cli";

function home(): string {
  return process.env.HOME ?? homedir();
}

export function configDir(): string {
  switch (platform()) {
    case "darwin":
      return join(home(), "Library", "Application Support", APP);
    case "win32":
      return join(process.env.APPDATA ?? join(home(), "AppData", "Roaming"), APP);
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home(), ".config"), APP);
  }
}

export function cacheDir(): string {
  switch (platform()) {
    case "darwin":
      return join(home(), "Library", "Caches", APP);
    case "win32":
      return join(process.env.LOCALAPPDATA ?? join(home(), "AppData", "Local"), APP, "Cache");
    default:
      return join(process.env.XDG_CACHE_HOME ?? join(home(), ".cache"), APP);
  }
}

export function metadataPath(): string {
  return join(configDir(), "workspaces.json");
}

export function lockPath(): string {
  return join(configDir(), "workspaces.lock");
}

export function teamCacheDir(teamId: string): string {
  return join(cacheDir(), teamId);
}

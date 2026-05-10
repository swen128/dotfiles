import { Entry } from "@napi-rs/keyring";

const SERVICE = "slack-cli";

export interface KeychainSecret {
  access_token: string;
  refresh_token: string | null;
  client_secret: string;
}

export interface KeychainBackend {
  get(teamId: string): KeychainSecret | null;
  set(teamId: string, secret: KeychainSecret): void;
  delete(teamId: string): void;
  available(): boolean;
}

export class OsKeychain implements KeychainBackend {
  available(): boolean {
    try {
      const entry = new Entry(SERVICE, "__probe__");
      entry.setPassword("ok");
      entry.deletePassword();
      return true;
    } catch {
      return false;
    }
  }

  get(teamId: string): KeychainSecret | null {
    try {
      const raw = new Entry(SERVICE, teamId).getPassword();
      if (raw === null || raw === undefined) return null;
      return JSON.parse(raw) as KeychainSecret;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/no.*entry|not found/i.test(msg)) return null;
      throw err;
    }
  }

  set(teamId: string, secret: KeychainSecret): void {
    new Entry(SERVICE, teamId).setPassword(JSON.stringify(secret));
  }

  delete(teamId: string): void {
    try {
      new Entry(SERVICE, teamId).deletePassword();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/no.*entry|not found/i.test(msg)) return;
      throw err;
    }
  }
}

import { SlackCliError, ExitCode } from "../errors.ts";
import { updateTokens, type WorkspaceCredentials } from "../store/store.ts";

interface RefreshResponse {
  ok: boolean;
  error?: string;
  authed_user?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export function isExpiringSoon(creds: WorkspaceCredentials, marginSeconds = 60): boolean {
  if (!creds.expires_at || !creds.refresh_token) return false;
  const expiresAt = Date.parse(creds.expires_at);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - Date.now() < marginSeconds * 1000;
}

export async function refreshTokens(creds: WorkspaceCredentials): Promise<WorkspaceCredentials> {
  if (!creds.refresh_token) {
    throw new SlackCliError({
      code: "no_refresh_token",
      message:
        "this workspace's token is not rotating; cannot refresh. Re-run `slack-cli login`.",
      exitCode: ExitCode.Auth,
    });
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refresh_token,
  });
  const auth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString("base64");
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json()) as RefreshResponse;
  if (!data.ok) {
    throw new SlackCliError({
      code: data.error ?? "refresh_failed",
      message: `token refresh failed: ${data.error ?? "unknown"}`,
      exitCode: ExitCode.Auth,
    });
  }
  const next =
    data.authed_user
      ? {
          access_token: data.authed_user.access_token,
          refresh_token: data.authed_user.refresh_token,
          expires_in: data.authed_user.expires_in,
        }
      : data.access_token && data.refresh_token && data.expires_in
        ? { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in }
        : null;
  if (!next) {
    throw new SlackCliError({
      code: "refresh_no_token",
      message: "refresh response did not include new tokens",
      exitCode: ExitCode.Auth,
    });
  }
  const expiresAt = new Date(Date.now() + next.expires_in * 1000).toISOString();
  await updateTokens(creds.team_id, {
    access_token: next.access_token,
    refresh_token: next.refresh_token,
    expires_at: expiresAt,
  });
  return {
    ...creds,
    access_token: next.access_token,
    refresh_token: next.refresh_token,
    expires_at: expiresAt,
  };
}

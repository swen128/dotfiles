import { ExitCode, SlackCliError } from "../errors.ts";
import { runOAuthFlow } from "../auth/oauth.ts";
import { fetchClientCredentials } from "../auth/secrets.ts";
import { OsKeychain } from "../store/keychain.ts";
import { putCredentials } from "../store/store.ts";
import { USER_SCOPES } from "../slack/manifest.ts";
import type { CredentialStoreKind } from "../store/metadata.ts";
import { emit, type OutputFormat } from "../output.ts";

export interface LoginArgs {
  port: number;
  setDefault: boolean;
  credentialStore: CredentialStoreKind | "auto";
  output: OutputFormat;
}

export async function loginCommand(args: LoginArgs): Promise<void> {
  const storeKind = resolveStoreKind(args.credentialStore);

  const { clientId, clientSecret } = await fetchClientCredentials();

  const tokens = await runOAuthFlow({
    clientId,
    clientSecret,
    port: args.port,
    scopes: [...USER_SCOPES],
    timeoutMs: 5 * 60 * 1000,
  });

  const authTest = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const auth = (await authTest.json()) as {
    ok: boolean;
    error?: string;
    team_id?: string;
    team?: string;
    url?: string;
    user?: string;
    user_id?: string;
  };
  if (!auth.ok || !auth.team_id || !auth.team || !auth.url || !auth.user_id) {
    throw new SlackCliError({
      code: auth.error ?? "auth_test_failed",
      message: `auth.test failed: ${auth.error ?? "unknown"}`,
      exitCode: ExitCode.Auth,
    });
  }
  const teamDomain = new URL(auth.url).hostname.split(".")[0]!;

  await putCredentials(
    {
      team_id: auth.team_id,
      team_name: auth.team,
      team_domain: teamDomain,
      user_id: auth.user_id,
      client_id: clientId,
      client_secret: clientSecret,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      logged_in_at: new Date().toISOString(),
    },
    { setDefault: args.setDefault },
    storeKind,
  );

  emit(args.output, {
    ok: true,
    team_id: auth.team_id,
    team_name: auth.team,
    team_domain: teamDomain,
    user_id: auth.user_id,
  });
}

function resolveStoreKind(requested: CredentialStoreKind | "auto"): CredentialStoreKind {
  if (requested === "file") return "file";
  if (requested === "keychain") {
    if (!new OsKeychain().available()) {
      throw new SlackCliError({
        code: "keychain_unavailable",
        message:
          "keychain backend is not available; pass --credential-store file or set SLACK_CLI_CREDENTIAL_STORE=file",
        exitCode: ExitCode.Auth,
      });
    }
    return "keychain";
  }
  if (new OsKeychain().available()) return "keychain";
  throw new SlackCliError({
    code: "keychain_unavailable",
    message:
      "keychain backend is not available; pass --credential-store file or set SLACK_CLI_CREDENTIAL_STORE=file",
    exitCode: ExitCode.Auth,
  });
}

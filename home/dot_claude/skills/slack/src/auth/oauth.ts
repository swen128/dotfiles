import { SlackCliError, ExitCode } from "../errors.ts";
import { openBrowser } from "../browser.ts";
import { debug } from "../log.ts";
import { generatePkce, generateState } from "./pkce.ts";

export interface OAuthFlowOptions {
  clientId: string;
  clientSecret: string;
  port: number;
  scopes: string[];
  timeoutMs: number;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  user_id: string;
  team_id: string;
  team_name: string;
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  authed_user?: {
    id: string;
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  team?: { id: string; name: string };
}

export async function runOAuthFlow(opts: OAuthFlowOptions): Promise<OAuthTokens> {
  const { verifier, challenge } = generatePkce();
  const state = generateState();
  const redirectUri = `http://127.0.0.1:${opts.port}/oauth/callback`;
  const authorizeUrl =
    `https://slack.com/oauth/v2/authorize?` +
    new URLSearchParams({
      client_id: opts.clientId,
      user_scope: opts.scopes.join(","),
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

  const callback = await waitForCallback(opts.port, state, opts.timeoutMs, authorizeUrl);

  const tokens = await exchangeCode({
    code: callback.code,
    redirectUri,
    verifier,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
  });

  return tokens;
}

interface CallbackResult {
  code: string;
}

function waitForCallback(
  port: number,
  expectedState: string,
  timeoutMs: number,
  authorizeUrl: string,
): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let server: ReturnType<typeof Bun.serve> | null = null;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      server?.stop(true);
      reject(
        new SlackCliError({
          code: "oauth_timeout",
          message: `OAuth flow did not complete within ${Math.round(timeoutMs / 1000)}s`,
          exitCode: ExitCode.Auth,
        }),
      );
    }, timeoutMs);

    const finish = (err: SlackCliError | null, value: CallbackResult | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setTimeout(() => server?.stop(true), 100);
      if (err) reject(err);
      else resolve(value!);
    };

    server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname !== "/oauth/callback") {
          return new Response("Not found", { status: 404 });
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          finish(
            new SlackCliError({
              code: "oauth_denied",
              message: `OAuth flow returned error: ${error}`,
              exitCode: ExitCode.Auth,
            }),
            null,
          );
          return new Response(htmlPage(`Authentication failed: ${error}. You can close this window.`), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        if (!code || !state) {
          finish(
            new SlackCliError({
              code: "oauth_invalid_callback",
              message: "OAuth callback missing code or state",
              exitCode: ExitCode.Auth,
            }),
            null,
          );
          return new Response(htmlPage("Invalid callback. You can close this window."), {
            status: 400,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        if (state !== expectedState) {
          finish(
            new SlackCliError({
              code: "oauth_state_mismatch",
              message: "OAuth callback state does not match",
              exitCode: ExitCode.Auth,
            }),
            null,
          );
          return new Response(htmlPage("State mismatch. You can close this window."), {
            status: 400,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        finish(null, { code });
        return new Response(
          htmlPage("Authentication successful. You can close this window and return to the terminal."),
          { headers: { "content-type": "text/html; charset=utf-8" } },
        );
      },
      error() {
        return new Response("Internal error", { status: 500 });
      },
    });

    debug(`Loopback listening on http://127.0.0.1:${port}`);

    void openBrowser(authorizeUrl).then((opened) => {
      if (!opened) {
        process.stderr.write(
          `\nCould not open browser automatically. Open this URL to authenticate:\n${authorizeUrl}\n\n`,
        );
      } else {
        process.stderr.write(`Opened browser for Slack authentication.\nIf the browser did not open, visit:\n${authorizeUrl}\n`);
      }
    });
  });
}

async function exchangeCode(args: {
  code: string;
  redirectUri: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.verifier,
  });
  const auth = Buffer.from(`${args.clientId}:${args.clientSecret}`).toString("base64");
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok) {
    throw new SlackCliError({
      code: data.error ?? "oauth_exchange_failed",
      message: `oauth.v2.access failed: ${data.error ?? "unknown"}`,
      exitCode: ExitCode.Auth,
    });
  }
  if (!data.authed_user || !data.team) {
    throw new SlackCliError({
      code: "oauth_no_user_token",
      message: "oauth.v2.access response did not include authed_user or team",
      exitCode: ExitCode.Auth,
    });
  }
  const accessToken = data.authed_user.access_token;
  if (!accessToken) {
    throw new SlackCliError({
      code: "oauth_no_user_token",
      message: "oauth.v2.access response did not include a user access_token",
      exitCode: ExitCode.Auth,
    });
  }
  const refreshTokenRaw = data.authed_user.refresh_token ?? data.refresh_token;
  const expiresInRaw = data.authed_user.expires_in ?? data.expires_in;
  const hasRotation =
    typeof refreshTokenRaw === "string" &&
    refreshTokenRaw.length > 0 &&
    typeof expiresInRaw === "number" &&
    Number.isFinite(expiresInRaw);
  return {
    access_token: accessToken,
    refresh_token: hasRotation ? refreshTokenRaw : null,
    expires_at: hasRotation ? new Date(Date.now() + expiresInRaw * 1000).toISOString() : null,
    user_id: data.authed_user.id,
    team_id: data.team.id,
    team_name: data.team.name,
  };
}

function htmlPage(message: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>slack-cli</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 4em; max-width: 40em; margin: 0 auto; color: #222; }
  h1 { font-size: 1.4em; }
</style>
</head><body><h1>slack-cli</h1><p>${escapeHtml(message)}</p></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

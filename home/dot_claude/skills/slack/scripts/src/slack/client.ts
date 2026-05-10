import { ExitCode, SlackCliError, fromSlackError } from "../errors.ts";
import { debug } from "../log.ts";
import { isExpiringSoon, refreshTokens } from "../auth/refresh.ts";
import type { WorkspaceCredentials } from "../store/store.ts";

export interface SlackResponse {
  ok: boolean;
  error?: string;
  needed?: string;
  response_metadata?: { next_cursor?: string; messages?: string[]; warnings?: string[] };
  [key: string]: unknown;
}

export interface CallOptions {
  method?: "GET" | "POST";
  maxRetries?: number;
}

export class SlackClient {
  private creds: WorkspaceCredentials;

  constructor(creds: WorkspaceCredentials) {
    this.creds = creds;
  }

  get credentials(): WorkspaceCredentials {
    return this.creds;
  }

  async call<T extends SlackResponse>(
    method: string,
    params: Record<string, unknown> = {},
    options: CallOptions = {},
  ): Promise<T> {
    if (isExpiringSoon(this.creds)) {
      this.creds = await refreshTokens(this.creds);
    }
    const maxRetries = options.maxRetries ?? 5;
    let attempt = 0;
    let backoff = 1000;
    while (true) {
      attempt++;
      const res = await this.send(method, params, options.method ?? "POST");
      const status = res.status;
      const requestId = res.headers.get("x-slack-req-id") ?? undefined;

      if (status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1");
        if (attempt > maxRetries) {
          throw new SlackCliError({
            code: "ratelimited",
            message: `rate limited by Slack on ${method}`,
            exitCode: ExitCode.RateLimit,
            requestId,
            retryAfter,
          });
        }
        debug(`429 from ${method}; sleeping ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (status >= 500) {
        if (attempt > 3) {
          throw new SlackCliError({
            code: `slack_${status}`,
            message: `Slack returned HTTP ${status} on ${method}`,
            exitCode: ExitCode.SlackInternal,
            requestId,
          });
        }
        debug(`HTTP ${status} from ${method}; backing off ${backoff}ms`);
        await sleep(backoff);
        backoff *= 2;
        continue;
      }
      const data = (await res.json()) as T;
      if (data.ok) return data;

      if (data.error === "token_expired" && attempt === 1) {
        debug(`token_expired on ${method}; refreshing`);
        this.creds = await refreshTokens(this.creds);
        continue;
      }
      if (data.error === "ratelimited") {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1");
        if (attempt > maxRetries) {
          throw fromSlackError({
            error: "ratelimited",
            message: `rate limited by Slack on ${method}`,
            requestId,
            retryAfter,
          });
        }
        await sleep(retryAfter * 1000);
        continue;
      }
      throw fromSlackError({
        error: data.error ?? "unknown_error",
        message: `${method} failed: ${data.error ?? "unknown"}`,
        requestId,
        neededScope: data.needed,
      });
    }
  }

  async *paginate<TItem>(
    method: string,
    params: Record<string, unknown>,
    extract: (resp: SlackResponse) => TItem[] | undefined,
  ): AsyncGenerator<TItem> {
    let cursor: string | undefined;
    while (true) {
      const resp: SlackResponse = await this.call(method, { ...params, cursor });
      const items = extract(resp) ?? [];
      for (const item of items) yield item;
      cursor = resp.response_metadata?.next_cursor;
      if (!cursor) return;
    }
  }

  private async send(
    method: string,
    params: Record<string, unknown>,
    httpMethod: "GET" | "POST",
  ): Promise<Response> {
    const url = `https://slack.com/api/${method}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.creds.access_token}`,
    };
    if (httpMethod === "GET") {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        query.set(k, typeof v === "string" ? v : JSON.stringify(v));
      }
      const full = query.toString() ? `${url}?${query.toString()}` : url;
      return fetch(full, { headers });
    }
    headers["content-type"] = "application/x-www-form-urlencoded; charset=utf-8";
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      body.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    return fetch(url, { method: "POST", headers, body });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

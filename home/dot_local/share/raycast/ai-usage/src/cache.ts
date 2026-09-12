import { Limit, Provider } from "./model";
export const REFRESH_MS = 5 * 60 * 1000;
export class RateLimitError extends Error {
  constructor(public retryAfterMs = 0) {
    super("Too many requests. Usage refresh is paused.");
  }
}
export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}
export type SavedUsage = {
  provider: Provider;
  nextAttemptAt: number;
  failures: number;
};
export type UsageStore = {
  read(key: string): SavedUsage | undefined;
  write(key: string, value: SavedUsage): void;
};
// Only usage and retry metadata are stored, never credentials.
export function createUsageLoader(store: UsageStore, now = Date.now) {
  const pending = new Map<string, Promise<Provider>>();
  return function load(key: string, name: Provider["name"], fetcher: () => Promise<Limit[]>): Promise<Provider> {
    const running = pending.get(key);
    if (running) return running;
    const previous = store.read(key);
    if (previous && now() < previous.nextAttemptAt) return Promise.resolve(previous.provider);
    const request = Promise.resolve()
      .then(async () => {
        try {
          const provider = {
            name,
            limits: await fetcher(),
            updatedAt: new Date(now()).toISOString(),
          };
          store.write(key, {
            provider,
            nextAttemptAt: now() + REFRESH_MS,
            failures: 0,
          });
          return provider;
        } catch (error) {
          const failures = (previous?.failures ?? 0) + 1;
          const delay =
            error instanceof RateLimitError
              ? Math.max(error.retryAfterMs, REFRESH_MS * 2 ** Math.min(failures - 1, 4))
              : REFRESH_MS;
          const nextAttemptAt = now() + delay;
          const provider: Provider = {
            name,
            limits: previous?.provider.limits ?? [],
            updatedAt: previous?.provider.updatedAt,
            error: error instanceof Error ? error.message : "Usage unavailable",
            retryAt: new Date(nextAttemptAt).toISOString(),
          };
          store.write(key, { provider, nextAttemptAt, failures });
          return provider;
        }
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}

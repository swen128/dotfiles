import { Cache, Color, getPreferenceValues } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { fetchClaude, fetchCodex, fetchGemini } from "./providers";
import { createUsageLoader, SavedUsage } from "./cache";
import { Limit, Provider } from "./model";

const cache = new Cache();
const load = createUsageLoader({
  read(key) {
    const value = cache.get(key);
    if (!value) return undefined;
    try {
      return JSON.parse(value) as SavedUsage;
    } catch {
      return undefined;
    }
  },
  write(key, value) {
    cache.set(key, JSON.stringify(value));
  },
});

async function fetchProviders(codexPath?: string, agyPath?: string) {
  return Promise.all([
    load("claude-usage-v1", "Claude", fetchClaude),
    load(`codex-usage-v1:${codexPath ?? ""}`, "Codex", () => fetchCodex(codexPath)),
    load(`gemini-usage-v1:${agyPath ?? ""}`, "Gemini", () => fetchGemini(agyPath)),
  ]);
}

export function useUsage() {
  const { codexPath, agyPath } = getPreferenceValues<{ codexPath?: string; agyPath?: string }>();
  return useCachedPromise(fetchProviders, [codexPath, agyPath]);
}

export function color(limit: Limit) {
  if (limit.percent === undefined) return Color.SecondaryText;
  if (limit.percent >= 90) return Color.Red;
  if (limit.percent >= 70) return Color.Orange;
  return Color.Green;
}

export const dashboards: Record<Provider["name"], string> = {
  Claude: "https://claude.ai/settings/usage",
  Codex: "https://chatgpt.com/codex/settings/usage",
  Gemini: "https://gemini.google.com/usage",
};

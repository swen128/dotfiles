export type Limit = {
  id: string;
  label: string;
  percent?: number;
  resetsAt?: string;
};
export type Provider = {
  name: "Claude" | "Codex";
  limits: Limit[];
  updatedAt?: string;
  error?: string;
  retryAt?: string;
};
type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}
function percent(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function date(value: unknown): string | undefined {
  const parsed =
    typeof value === "string" ? new Date(value) : typeof value === "number" ? new Date(value * 1000) : undefined;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}
export function parseClaude(value: unknown): Limit[] {
  const data = record(value);
  if (!Array.isArray(data.limits) && !("five_hour" in data)) throw new Error("Unrecognized Claude usage response");
  const limits: Limit[] = [];
  if (Array.isArray(data.limits)) {
    for (const raw of data.limits) {
      const item = record(raw);
      const model = record(record(item.scope).model);
      const label =
        item.kind === "session"
          ? "5h"
          : item.kind === "weekly_all"
            ? "1w"
            : typeof model.display_name === "string"
              ? `${model.display_name} 1w`
              : String(item.kind ?? "Other limit");
      limits.push({
        id: `limit-${limits.length}`,
        label,
        percent: percent(item.percent),
        resetsAt: date(item.resets_at),
      });
    }
  }
  for (const [key, label] of [
    ["five_hour", "5h"],
    ["seven_day", "1w"],
    ["seven_day_sonnet", "Sonnet 1w"],
    ["seven_day_opus", "Opus 1w"],
  ] as const) {
    if (limits.some((limit) => limit.label === label)) continue;
    const item = record(data[key]);
    if (key === "five_hour" || key === "seven_day" || Object.keys(item).length)
      limits.push({
        id: key,
        label,
        percent: percent(item.utilization),
        resetsAt: date(item.resets_at),
      });
  }
  if (!limits.some((limit) => /fable/i.test(limit.label))) limits.push({ id: "fable", label: "Fable 1w" });
  return limits;
}
export function parseCodex(value: unknown): Limit[] {
  const data = record(value);
  const buckets = record(data.rateLimitsByLimitId);
  if (!Object.keys(buckets).length && data.rateLimits) buckets.codex = data.rateLimits;
  if (!Object.keys(buckets).length)
    throw new Error("No Codex limits returned. Sign in with ChatGPT using codex login.");
  const limits: Limit[] = [];
  for (const [id, raw] of Object.entries(buckets)) {
    const bucket = record(raw);
    for (const slot of ["primary", "secondary"]) {
      const item = record(bucket[slot]);
      if (!Object.keys(item).length) continue;
      const minutes = item.windowDurationMins;
      const duration =
        minutes === 300 ? "5h" : minutes === 10080 ? "1w" : typeof minutes === "number" ? `${minutes / 60}h` : slot;
      const prefix = id === "codex" ? "" : `${String(bucket.limitName ?? id)} `;
      limits.push({
        id: `${id}-${slot}`,
        label: `${prefix}${duration}`,
        percent: percent(item.usedPercent),
        resetsAt: date(item.resetsAt),
      });
    }
  }
  return limits;
}
export function usageText(limit: Limit): string {
  return limit.percent === undefined ? "Unavailable" : `${Math.round(limit.percent)}% used`;
}
export function resetText(limit: Limit, now = Date.now()): string {
  if (!limit.resetsAt) return "Reset not reported";
  const minutes = Math.ceil((Date.parse(limit.resetsAt) - now) / 60000);
  if (minutes <= 0) return "Reset due · refresh usage";
  return `Resets in ${minutes >= 1440 ? `${Math.floor(minutes / 1440)}d ` : ""}${minutes >= 60 ? `${Math.floor(minutes / 60) % 24}h ` : ""}${minutes % 60}m`;
}

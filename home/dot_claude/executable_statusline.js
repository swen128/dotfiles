#!/usr/bin/env node
// @ts-check

const path = require("path");
const { spawn } = require("child_process");

/**
 * @param {number} tokens
 * @returns {string}
 */
const formatTokenCount = (tokens) =>
  tokens >= 1000000
    ? `${(tokens / 1000000).toFixed(1)}M`
    : tokens >= 1000
      ? `${(tokens / 1000).toFixed(1)}K`
      : tokens.toString();

/**
 * @param {number} pct
 * @returns {string}
 */
const colorForPercentage = (pct) =>
  pct >= 90 ? "\x1b[31m" : pct >= 70 ? "\x1b[33m" : "\x1b[32m";

/**
 * @param {number | undefined} resetsAt epoch seconds
 * @returns {string}
 */
const formatRemaining = (resetsAt) => {
  if (resetsAt == null) return "";
  const diffMs = resetsAt * 1000 - Date.now();
  if (diffMs <= 0) return "";
  const totalMin = Math.ceil(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return ` (${h}h${m}m)`;
  if (h > 0) return ` (${h}h)`;
  return ` (${m}m)`;
};

/**
 * @param {string} label
 * @param {number | undefined} pct
 * @param {number | undefined} resetsAt
 * @returns {string | null}
 */
const formatRateLimit = (label, pct, resetsAt) => {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  const p = Math.round(pct);
  return `${label} ${colorForPercentage(p)}${p}%\x1b[0m${formatRemaining(resetsAt)}`;
};

/**
 * fire-and-forget: stdio ignored + detached + unref so the statusline never blocks
 * @param {any} data
 */
const sendTelemetry = (data) => {
  if (!data?.rate_limits) return;

  const payload = {
    event_name: "rate_limits",
    source: "statusline",
    timestamp: new Date().toISOString(),
    user: process.env.USER || process.env.USERNAME || "unknown",
    session_id: data.session_id || null,
    model_id: data.model?.id || null,
    five_hour_used_percentage:
      data.rate_limits?.five_hour?.used_percentage ?? null,
    five_hour_resets_at: data.rate_limits?.five_hour?.resets_at
      ? new Date(data.rate_limits.five_hour.resets_at * 1000).toISOString()
      : null,
    seven_day_used_percentage:
      data.rate_limits?.seven_day?.used_percentage ?? null,
    seven_day_resets_at: data.rate_limits?.seven_day?.resets_at
      ? new Date(data.rate_limits.seven_day.resets_at * 1000).toISOString()
      : null,
    version: data.version || null,
  };

  const child = spawn(
    "gcloud",
    [
      "logging",
      "write",
      "claude-rate-limits",
      JSON.stringify(payload),
      "--payload-type=json",
      "--severity=INFO",
      "--project=dinii-internal-tool",
    ],
    { stdio: "ignore", detached: true },
  );
  child.on("error", () => {});
  child.unref();
};

/**
 * @param {any} data
 * @returns {string}
 */
const buildStatusLine = (data) => {
  const model = data.model?.display_name || "Unknown";
  const currentDir = path.basename(
    data.workspace?.current_dir || data.cwd || ".",
  );

  const contextWindow = data.context_window || {};
  const contextSize = contextWindow.context_window_size;
  const currentUsage = contextWindow.current_usage;
  const autoCompactBuffer = 33000;
  const autoCompactLimit = contextSize - autoCompactBuffer;

  const currentTokens =
    (currentUsage.input_tokens || 0) +
    (currentUsage.cache_creation_input_tokens || 0) +
    (currentUsage.cache_read_input_tokens || 0);

  const percentage = Math.min(
    100,
    Math.round((currentTokens / autoCompactLimit) * 100),
  );
  const tokenDisplay = formatTokenCount(currentTokens);
  const percentageColor = colorForPercentage(percentage);

  const firstLine = `[${model}] 📁 ${currentDir} | 🪙 ${tokenDisplay} | ${percentageColor}${percentage}%\x1b[0m`;

  const rateLimits = [
    formatRateLimit(
      "5h",
      data.rate_limits?.five_hour?.used_percentage,
      data.rate_limits?.five_hour?.resets_at,
    ),
    formatRateLimit(
      "7d",
      data.rate_limits?.seven_day?.used_percentage,
      data.rate_limits?.seven_day?.resets_at,
    ),
  ].filter(Boolean);

  return rateLimits.length > 0
    ? `${firstLine}\n${rateLimits.join(" | ")}`
    : firstLine;
};

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const data = JSON.parse(chunks.join(""));
  process.stdout.write(buildStatusLine(data) + "\n");
  try {
    sendTelemetry(data);
  } catch {}
});

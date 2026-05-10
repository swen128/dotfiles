export type OutputFormat = "json" | "ndjson" | "text";

export function emit(format: OutputFormat, value: unknown, textRenderer?: (v: unknown) => string): void {
  switch (format) {
    case "json":
      process.stdout.write(JSON.stringify(value, null, 2) + "\n");
      break;
    case "ndjson":
      process.stdout.write(JSON.stringify(value) + "\n");
      break;
    case "text":
      process.stdout.write((textRenderer ? textRenderer(value) : defaultText(value)) + "\n");
      break;
  }
}

export function emitStream(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + "\n");
}

function defaultText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function emitError(payload: object): void {
  process.stderr.write(JSON.stringify(payload) + "\n");
}

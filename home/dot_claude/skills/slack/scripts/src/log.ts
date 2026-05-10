let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function isVerbose(): boolean {
  return verbose;
}

export function debug(...parts: unknown[]): void {
  if (!verbose) return;
  process.stderr.write("[debug] " + parts.map(stringify).map(maskSecrets).join(" ") + "\n");
}

export function warn(...parts: unknown[]): void {
  process.stderr.write("[warn] " + parts.map(stringify).map(maskSecrets).join(" ") + "\n");
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const SECRET_RE =
  /xoxe\.xox[bp]-[A-Za-z0-9-]+|xoxe-\d+-[A-Za-z0-9-]+|xox[ebpars]-[A-Za-z0-9-]+/g;

export function maskSecrets(s: string): string {
  return s.replace(SECRET_RE, (m) => m.slice(0, 6) + "…");
}

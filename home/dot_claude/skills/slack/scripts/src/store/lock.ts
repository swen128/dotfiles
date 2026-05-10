import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { lockPath } from "../paths.ts";

export async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const path = lockPath();
  await mkdir(dirname(path), { recursive: true });
  const start = Date.now();
  const timeoutMs = 10_000;
  while (true) {
    try {
      const file = Bun.file(path);
      const exists = await file.exists();
      if (!exists) {
        await Bun.write(path, String(process.pid));
        try {
          return await fn();
        } finally {
          await safeUnlink(path);
        }
      }
    } catch {}
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Could not acquire lock at ${path} within ${timeoutMs}ms`);
    }
    await sleep(50);
  }
}

async function safeUnlink(path: string): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    await fs.unlink(path);
  } catch {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

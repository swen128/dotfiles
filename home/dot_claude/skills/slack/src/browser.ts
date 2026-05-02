import { spawn } from "node:child_process";
import { platform } from "node:os";

export async function openBrowser(url: string): Promise<boolean> {
  const cmd = browserCommand();
  if (!cmd) return false;
  return new Promise((resolve) => {
    const child = spawn(cmd.command, [...cmd.args, url], {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => resolve(false));
    child.unref();
    setTimeout(() => resolve(true), 100);
  });
}

function browserCommand(): { command: string; args: string[] } | null {
  switch (platform()) {
    case "darwin":
      return { command: "open", args: [] };
    case "win32":
      return { command: "cmd", args: ["/c", "start", ""] };
    default:
      return { command: "xdg-open", args: [] };
  }
}

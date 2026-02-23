import { readTranscript } from "../transcript.ts";

export async function fireConfetti(transcriptPath: string): Promise<void> {
  if (process.env["CLAUDE_CODE_ENTRYPOINT"] !== "cli") return;
  const transcript = await readTranscript(transcriptPath);
  if (transcript?.teamName) return;
  Bun.spawn(["open", "-g", "raycast://confetti"]);
}

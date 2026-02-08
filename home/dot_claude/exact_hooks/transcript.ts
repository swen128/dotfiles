export type TextContentBlock = {
  type: "text";
  text: string;
};

export type ToolUseContentBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResultContentBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

export type ThinkingContentBlock = {
  type: "thinking";
  thinking: string;
  signature: string;
};

export type ContentBlock =
  | TextContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock
  | ThinkingContentBlock;

export type TranscriptMessage = {
  role: "user" | "assistant";
  content: ContentBlock[] | string;
};

export type Transcript = {
  sessionId: string;
  cwd: string;
  teamName?: string;
  messages: TranscriptMessage[];
};

function isRawHeader(
  value: unknown,
): value is { sessionId: string; cwd: string; teamName?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "cwd" in value &&
    typeof value.cwd === "string"
  );
}

export function isContentBlock(value: unknown): value is ContentBlock {
  if (typeof value !== "object" || value === null || !("type" in value))
    return false;
  const b = value as Record<string, unknown>;
  switch (b.type) {
    case "text":
      return typeof b.text === "string";
    case "tool_use":
      return (
        typeof b.id === "string" &&
        typeof b.name === "string" &&
        typeof b.input === "object" &&
        b.input !== null
      );
    case "tool_result":
      return typeof b.tool_use_id === "string";
    case "thinking":
      return typeof b.thinking === "string" && typeof b.signature === "string";
    default:
      return false;
  }
}

function isTranscriptMessage(
  value: unknown,
): value is TranscriptMessage {
  if (typeof value !== "object" || value === null || !("role" in value))
    return false;
  const m = value as Record<string, unknown>;
  if (m.role !== "user" && m.role !== "assistant") return false;
  if (typeof m.content === "string") return true;
  if (!Array.isArray(m.content)) return false;
  return m.content.every(isContentBlock);
}

function hasMessage(
  value: unknown,
): value is { message: TranscriptMessage } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    isTranscriptMessage((value as Record<string, unknown>).message)
  );
}

export async function readTranscript(
  path: string,
): Promise<Transcript | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;

  const lines = (await file.text()).split("\n").filter(Boolean);
  const [header, ...rest] = lines.map((l) => JSON.parse(l));
  if (!isRawHeader(header)) return null;

  return {
    sessionId: header.sessionId,
    cwd: header.cwd,
    teamName: header.teamName,
    messages: rest.filter(hasMessage).map((e) => e.message),
  };
}

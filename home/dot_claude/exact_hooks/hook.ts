export type PermissionMode =
  | "default"
  | "plan"
  | "acceptEdits"
  | "dontAsk"
  | "bypassPermissions";

export type BashToolInput = {
  command: string;
  description?: string;
  timeout?: number;
  run_in_background?: boolean;
};

export type WriteToolInput = {
  file_path: string;
  content: string;
};

export type EditToolInput = {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

export type MultiEditToolInput = {
  file_path: string;
  edits: { old_string: string; new_string: string }[];
};

export type ReadToolInput = {
  file_path: string;
  offset?: number;
  limit?: number;
};

export type GlobToolInput = {
  pattern: string;
  path?: string;
};

export type GrepToolInput = {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: "content" | "files_with_matches" | "count";
  "-i"?: boolean;
  multiline?: boolean;
};

export type WebFetchToolInput = {
  url: string;
  prompt: string;
};

export type TaskToolInput = {
  prompt: string;
  description: string;
  subagent_type: string;
  model?: string;
};

type HookInputBase = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: PermissionMode;
};

export type SessionStartInput = HookInputBase & {
  hook_event_name: "SessionStart";
  source: "startup" | "resume" | "clear" | "compact";
  model: string;
};

export type UserPromptSubmitInput = HookInputBase & {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
};

export type PreToolUseInput = HookInputBase & {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
};

export type PermissionRequestInput = HookInputBase & {
  hook_event_name: "PermissionRequest";
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
};

export type PostToolUseInput = HookInputBase & {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
};

export type PostToolUseFailureInput = HookInputBase & {
  hook_event_name: "PostToolUseFailure";
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
  error: string;
  is_interrupt: boolean;
};

export type NotificationInput = HookInputBase & {
  hook_event_name: "Notification";
  message: string;
  title: string;
  notification_type:
    | "permission_prompt"
    | "idle_prompt"
    | "auth_success"
    | "elicitation_dialog";
};

export type StopInput = HookInputBase & {
  hook_event_name: "Stop";
  stop_hook_active: boolean;
};

export type SubagentStartInput = HookInputBase & {
  hook_event_name: "SubagentStart";
  agent_id: string;
  agent_type: string;
};

export type SubagentStopInput = HookInputBase & {
  hook_event_name: "SubagentStop";
  stop_hook_active: boolean;
  agent_id: string;
  agent_type: string;
  agent_transcript_path: string;
};

export type TeammateIdleInput = HookInputBase & {
  hook_event_name: "TeammateIdle";
  teammate_name: string;
  team_name: string;
};

export type TaskCompletedInput = HookInputBase & {
  hook_event_name: "TaskCompleted";
  task_id: string;
  task_subject: string;
  task_description: string;
  teammate_name: string;
  team_name: string;
};

export type PreCompactInput = HookInputBase & {
  hook_event_name: "PreCompact";
  trigger: "manual" | "auto";
  custom_instructions: string;
};

export type SessionEndInput = HookInputBase & {
  hook_event_name: "SessionEnd";
  reason:
    | "clear"
    | "logout"
    | "prompt_input_exit"
    | "bypass_permissions_disabled"
    | "other";
};

export type HookInput =
  | SessionStartInput
  | UserPromptSubmitInput
  | PreToolUseInput
  | PermissionRequestInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | NotificationInput
  | StopInput
  | SubagentStartInput
  | SubagentStopInput
  | TeammateIdleInput
  | TaskCompletedInput
  | PreCompactInput
  | SessionEndInput;

export type PreToolUseJsonOutput = {
  hookSpecificOutput:
    | {
        hookEventName: "PreToolUse";
        permissionDecision: "allow" | "ask";
        permissionDecisionReason: string;
        updatedInput?: Record<string, unknown>;
        additionalContext?: string;
      }
    | {
        hookEventName: "PreToolUse";
        permissionDecision: "deny";
        permissionDecisionReason: string;
        additionalContext?: string;
      };
};

export type PermissionRequestJsonOutput = {
  hookSpecificOutput: {
    hookEventName: "PermissionRequest";
    decision:
      | {
          behavior: "allow";
          updatedInput?: Record<string, unknown>;
          updatedPermissions?: unknown[];
          message?: string;
        }
      | {
          behavior: "deny";
          message?: string;
        };
  };
};

export type PostToolUseJsonOutput = {
  decision?: "block";
  reason?: string;
  hookSpecificOutput?: {
    hookEventName: "PostToolUse";
    additionalContext?: string;
    updatedMCPToolOutput?: string;
  };
};

export type SessionStartJsonOutput = {
  hookSpecificOutput: {
    hookEventName: "SessionStart";
    additionalContext: string;
  };
};

export type BlockingJsonOutput = {
  decision: "block";
  reason: string;
};

export type SystemMessageJsonOutput = {
  continue?: boolean;
  systemMessage?: string;
  suppressOutput?: boolean;
};

export type Allow = { readonly decision: "allow" };
export type Block = { readonly decision: "block"; readonly message: string };
export type Output<O> = { readonly decision: "output"; readonly data: O };

export type PreToolUseResult =
  | Allow
  | Block
  | Output<PreToolUseJsonOutput>;

export type PermissionRequestResult =
  | Allow
  | Block
  | Output<PermissionRequestJsonOutput>;

export type PostToolUseResult =
  | Allow
  | Output<PostToolUseJsonOutput>;

export type SessionStartResult =
  | Allow
  | Output<SessionStartJsonOutput>;

export type BlockableResult =
  | Allow
  | Block;

export type AllowOnlyResult = Allow;

export type HookResultMap = {
  SessionStart: SessionStartResult;
  UserPromptSubmit: BlockableResult;
  PreToolUse: PreToolUseResult;
  PermissionRequest: PermissionRequestResult;
  PostToolUse: PostToolUseResult;
  PostToolUseFailure: AllowOnlyResult;
  Notification: AllowOnlyResult;
  Stop: BlockableResult;
  SubagentStart: AllowOnlyResult;
  SubagentStop: BlockableResult;
  TeammateIdle: BlockableResult;
  TaskCompleted: BlockableResult;
  PreCompact: AllowOnlyResult;
  SessionEnd: AllowOnlyResult;
};

export type HookFn<I extends HookInput> = (
  input: I,
) =>
  | HookResultMap[I["hook_event_name"]]
  | Promise<HookResultMap[I["hook_event_name"]]>;

async function run<I extends HookInput>(fn: HookFn<I>): Promise<void> {
  const raw = await Bun.stdin.text();
  const input: I = JSON.parse(raw);
  const result = await fn(input);

  switch (result.decision) {
    case "allow":
      return;
    case "block":
      console.error(result.message);
      process.exit(2);
    case "output":
      console.log(JSON.stringify(result.data));
      return;
    default:
      result satisfies never;
  }
}

export const handleSessionStart = (fn: HookFn<SessionStartInput>) => run(fn);
export const handleUserPromptSubmit = (fn: HookFn<UserPromptSubmitInput>) => run(fn);
export const handlePreToolUse = (fn: HookFn<PreToolUseInput>) => run(fn);
export const handlePermissionRequest = (fn: HookFn<PermissionRequestInput>) => run(fn);
export const handlePostToolUse = (fn: HookFn<PostToolUseInput>) => run(fn);
export const handlePostToolUseFailure = (fn: HookFn<PostToolUseFailureInput>) => run(fn);
export const handleNotification = (fn: HookFn<NotificationInput>) => run(fn);
export const handleStop = (fn: HookFn<StopInput>) => run(fn);
export const handleSubagentStart = (fn: HookFn<SubagentStartInput>) => run(fn);
export const handleSubagentStop = (fn: HookFn<SubagentStopInput>) => run(fn);
export const handleTeammateIdle = (fn: HookFn<TeammateIdleInput>) => run(fn);
export const handleTaskCompleted = (fn: HookFn<TaskCompletedInput>) => run(fn);
export const handlePreCompact = (fn: HookFn<PreCompactInput>) => run(fn);
export const handleSessionEnd = (fn: HookFn<SessionEndInput>) => run(fn);

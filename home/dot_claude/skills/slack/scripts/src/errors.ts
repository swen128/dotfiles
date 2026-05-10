export const ExitCode = {
  Ok: 0,
  Other: 1,
  Auth: 10,
  Validation: 20,
  NotFound: 30,
  RateLimit: 40,
  Network: 50,
  SlackInternal: 60,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export interface SlackCliErrorPayload {
  error: string;
  message: string;
  request_id?: string | undefined;
  needed_scope?: string | undefined;
  retry_after?: number | undefined;
}

export class SlackCliError extends Error {
  readonly code: string;
  readonly exitCode: ExitCodeValue;
  readonly requestId?: string | undefined;
  readonly neededScope?: string | undefined;
  readonly retryAfter?: number | undefined;

  constructor(args: {
    code: string;
    message: string;
    exitCode: ExitCodeValue;
    requestId?: string | undefined;
    neededScope?: string | undefined;
    retryAfter?: number | undefined;
  }) {
    super(args.message);
    this.name = "SlackCliError";
    this.code = args.code;
    this.exitCode = args.exitCode;
    this.requestId = args.requestId;
    this.neededScope = args.neededScope;
    this.retryAfter = args.retryAfter;
  }

  toPayload(): SlackCliErrorPayload {
    return {
      error: this.code,
      message: this.message,
      request_id: this.requestId,
      needed_scope: this.neededScope,
      retry_after: this.retryAfter,
    };
  }
}

const SLACK_AUTH_ERRORS = new Set([
  "not_authed",
  "invalid_auth",
  "account_inactive",
  "token_revoked",
  "token_expired",
  "no_permission",
  "missing_scope",
]);

const SLACK_NOT_FOUND_ERRORS = new Set([
  "channel_not_found",
  "user_not_found",
  "thread_not_found",
  "message_not_found",
  "file_not_found",
]);

const SLACK_VALIDATION_ERRORS = new Set([
  "invalid_arguments",
  "invalid_arg_name",
  "invalid_array_arg",
  "invalid_charset",
  "invalid_form_data",
  "invalid_post_type",
  "missing_post_type",
  "invalid_blocks",
  "invalid_blocks_format",
  "msg_too_long",
  "no_text",
  "cant_update_message",
  "cant_delete_message",
  "edit_window_closed",
]);

export function exitCodeForSlackError(error: string): ExitCodeValue {
  if (SLACK_AUTH_ERRORS.has(error)) return ExitCode.Auth;
  if (SLACK_NOT_FOUND_ERRORS.has(error)) return ExitCode.NotFound;
  if (SLACK_VALIDATION_ERRORS.has(error)) return ExitCode.Validation;
  if (error === "ratelimited") return ExitCode.RateLimit;
  if (error.startsWith("internal_") || error === "fatal_error") return ExitCode.SlackInternal;
  return ExitCode.Other;
}

export function fromSlackError(args: {
  error: string;
  message?: string;
  requestId?: string | undefined;
  neededScope?: string | undefined;
  retryAfter?: number | undefined;
}): SlackCliError {
  return new SlackCliError({
    code: args.error,
    message: args.message ?? args.error,
    exitCode: exitCodeForSlackError(args.error),
    requestId: args.requestId,
    neededScope: args.neededScope,
    retryAfter: args.retryAfter,
  });
}

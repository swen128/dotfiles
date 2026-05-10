import { test, expect } from "bun:test";
import { ExitCode, exitCodeForSlackError, fromSlackError, SlackCliError } from "../src/errors.ts";

test("auth errors map to exit code 10", () => {
  expect(exitCodeForSlackError("token_expired")).toBe(ExitCode.Auth);
  expect(exitCodeForSlackError("missing_scope")).toBe(ExitCode.Auth);
  expect(exitCodeForSlackError("invalid_auth")).toBe(ExitCode.Auth);
});

test("not-found errors map to exit code 30", () => {
  expect(exitCodeForSlackError("channel_not_found")).toBe(ExitCode.NotFound);
  expect(exitCodeForSlackError("user_not_found")).toBe(ExitCode.NotFound);
});

test("validation errors map to exit code 20", () => {
  expect(exitCodeForSlackError("invalid_blocks")).toBe(ExitCode.Validation);
  expect(exitCodeForSlackError("msg_too_long")).toBe(ExitCode.Validation);
  expect(exitCodeForSlackError("cant_update_message")).toBe(ExitCode.Validation);
});

test("ratelimited maps to exit code 40", () => {
  expect(exitCodeForSlackError("ratelimited")).toBe(ExitCode.RateLimit);
});

test("internal_* maps to exit code 60", () => {
  expect(exitCodeForSlackError("internal_error")).toBe(ExitCode.SlackInternal);
  expect(exitCodeForSlackError("fatal_error")).toBe(ExitCode.SlackInternal);
});

test("unknown errors fall back to exit code 1", () => {
  expect(exitCodeForSlackError("unrecognized_thing")).toBe(ExitCode.Other);
});

test("SlackCliError.toPayload preserves all metadata", () => {
  const e = fromSlackError({
    error: "missing_scope",
    message: "missing scope: search:read",
    requestId: "req-1",
    neededScope: "search:read",
  });
  expect(e).toBeInstanceOf(SlackCliError);
  expect(e.exitCode).toBe(ExitCode.Auth);
  expect(e.toPayload()).toMatchObject({
    error: "missing_scope",
    message: "missing scope: search:read",
    request_id: "req-1",
    needed_scope: "search:read",
  });
});

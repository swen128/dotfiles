import { ExitCode, SlackCliError } from "../errors.ts";
import { emit, type OutputFormat } from "../output.ts";
import { deleteWorkspace, getCredentials, listWorkspaces, resolveWorkspace } from "../store/store.ts";

export interface LogoutArgs {
  workspace?: string | undefined;
  all: boolean;
  output: OutputFormat;
}

export async function logoutCommand(args: LogoutArgs): Promise<void> {
  if (args.all) {
    const list = await listWorkspaces();
    if (list.workspaces.length === 0) {
      emit(args.output, { ok: true, removed: [], note: "no workspaces authenticated" });
      return;
    }
    const removed: string[] = [];
    for (const w of list.workspaces) {
      await revokeIfPossible(w.team_id);
      const result = await deleteWorkspace(w.team_id);
      if (result.removed) removed.push(w.team_id);
    }
    emit(args.output, { ok: true, removed });
    return;
  }

  const list = await listWorkspaces();
  if (list.workspaces.length === 0) {
    emit(args.output, { ok: true, removed: null, note: "no workspaces authenticated" });
    return;
  }

  let teamId: string | null = null;
  try {
    const creds = await resolveWorkspace(args.workspace);
    teamId = creds.team_id;
  } catch (err) {
    if (err instanceof SlackCliError && (err.code === "workspace_not_found" || err.code === "no_workspaces_authenticated")) {
      emit(args.output, { ok: true, removed: null, note: err.message });
      return;
    }
    throw err;
  }

  await revokeIfPossible(teamId);
  const result = await deleteWorkspace(teamId);
  emit(args.output, {
    ok: true,
    removed: teamId,
    promoted_default: result.promoted,
  });
}

async function revokeIfPossible(teamId: string): Promise<void> {
  try {
    const creds = await getCredentials(teamId);
    if (!creds) return;
    await fetch("https://slack.com/api/auth.revoke", {
      method: "POST",
      headers: { authorization: `Bearer ${creds.access_token}` },
    });
  } catch {}
}

export function ensureLogoutSelectorOk(args: LogoutArgs): void {
  if (args.workspace && args.all) {
    throw new SlackCliError({
      code: "invalid_arguments",
      message: "--workspace and --all cannot be combined",
      exitCode: ExitCode.Validation,
    });
  }
}

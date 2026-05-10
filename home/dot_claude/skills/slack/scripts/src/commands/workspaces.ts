import { ExitCode, SlackCliError } from "../errors.ts";
import { emit, type OutputFormat } from "../output.ts";
import { listWorkspaces, setDefault } from "../store/store.ts";

export async function workspacesListCommand(output: OutputFormat): Promise<void> {
  const list = await listWorkspaces();
  emit(output, {
    default_workspace: list.default_workspace,
    workspaces: list.workspaces.map((w) => ({
      team_id: w.team_id,
      team_name: w.team_name,
      team_domain: w.team_domain,
      user_id: w.user_id,
      is_default: w.team_id === list.default_workspace,
      logged_in_at: w.logged_in_at,
      expires_at: w.expires_at,
    })),
  });
}

export async function workspacesSetDefaultCommand(selector: string, output: OutputFormat): Promise<void> {
  const list = await listWorkspaces();
  const matches = list.workspaces.filter(
    (w) => w.team_id === selector || w.team_domain === selector || w.team_name === selector,
  );
  if (matches.length === 0) {
    throw new SlackCliError({
      code: "workspace_not_found",
      message: `no authenticated workspace matches '${selector}'`,
      exitCode: ExitCode.NotFound,
    });
  }
  if (matches.length > 1) {
    throw new SlackCliError({
      code: "workspace_ambiguous",
      message: `'${selector}' matches multiple workspaces: ${matches.map((m) => m.team_id).join(", ")}`,
      exitCode: ExitCode.Validation,
    });
  }
  await setDefault(matches[0]!.team_id);
  emit(output, { ok: true, default_workspace: matches[0]!.team_id });
}

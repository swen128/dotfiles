import { ExitCode, SlackCliError } from "../errors.ts";

const OP_ACCOUNT = "T3XVGBQA4RARTJY6RQA2NDNZYI";
const OP_VAULT = "Employee";
const OP_ITEM = "Slack app for CLI";
const CLIENT_ID_FIELD = "Client ID";
const CLIENT_SECRET_FIELD = "Client Secret";

interface OpField {
  id?: string;
  label?: string;
  value?: string;
}
interface OpItem {
  id?: string;
  title?: string;
  fields?: OpField[];
}

export async function fetchClientCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const proc = Bun.spawn(
    [
      "op",
      "item",
      "get",
      OP_ITEM,
      "--vault",
      OP_VAULT,
      "--account",
      OP_ACCOUNT,
      "--format",
      "json",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new SlackCliError({
      code: "op_item_get_failed",
      message: `op item get "${OP_ITEM}" failed (exit ${exitCode}): ${stderr.trim() || "no stderr"}`,
      exitCode: ExitCode.Auth,
    });
  }
  const item = JSON.parse(stdout) as OpItem;
  const clientId = pickField(item, CLIENT_ID_FIELD);
  const clientSecret = pickField(item, CLIENT_SECRET_FIELD);
  return { clientId, clientSecret };
}

function pickField(item: OpItem, label: string): string {
  const f = item.fields?.find((x) => x.label === label);
  if (!f?.value) {
    throw new SlackCliError({
      code: "op_field_missing",
      message: `1Password item "${item.title ?? OP_ITEM}" has no field "${label}"`,
      exitCode: ExitCode.Auth,
    });
  }
  return f.value;
}

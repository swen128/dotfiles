import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { ExitCode, SlackCliError } from "../errors.ts";
import { emit, type OutputFormat } from "../output.ts";
import { isExpiringSoon, refreshTokens } from "../auth/refresh.ts";
import { resolveWorkspace } from "../store/store.ts";

export interface FilesDownloadArgs {
  fileId?: string | undefined;
  url?: string | undefined;
  out: string;
  workspace?: string | undefined;
  output: OutputFormat;
}

interface FilesInfoResponse {
  ok: boolean;
  error?: string;
  needed?: string;
  file?: {
    id: string;
    name?: string;
    mimetype?: string;
    size?: number;
    url_private?: string;
    url_private_download?: string;
    permalink?: string;
  };
}

export async function filesDownloadCommand(args: FilesDownloadArgs): Promise<void> {
  if (!args.fileId && !args.url) {
    throw new SlackCliError({
      code: "invalid_arguments",
      message: "files download requires --file-id <Fxxx> or --url <url_private>",
      exitCode: ExitCode.Validation,
    });
  }
  if (args.fileId && args.url) {
    throw new SlackCliError({
      code: "invalid_arguments",
      message: "specify only one of --file-id or --url",
      exitCode: ExitCode.Validation,
    });
  }

  let creds = await resolveWorkspace(args.workspace);
  if (isExpiringSoon(creds)) {
    creds = await refreshTokens(creds);
  }

  let downloadUrl: string;
  let filename: string | undefined;
  let mimetype: string | undefined;
  let size: number | undefined;
  let fileId: string | undefined = args.fileId;

  if (args.fileId) {
    const infoBody = new URLSearchParams({ file: args.fileId });
    const infoRes = await fetch("https://slack.com/api/files.info", {
      method: "POST",
      headers: {
        authorization: `Bearer ${creds.access_token}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: infoBody,
    });
    const info = (await infoRes.json()) as FilesInfoResponse;
    if (!info.ok || !info.file) {
      throw new SlackCliError({
        code: info.error ?? "files_info_failed",
        message: `files.info failed: ${info.error ?? "unknown"}`,
        exitCode: info.error === "missing_scope" ? ExitCode.Auth : ExitCode.NotFound,
        neededScope: info.needed,
      });
    }
    if (!info.file.url_private_download && !info.file.url_private) {
      throw new SlackCliError({
        code: "no_download_url",
        message: `file ${args.fileId} has no url_private_download`,
        exitCode: ExitCode.NotFound,
      });
    }
    downloadUrl = info.file.url_private_download ?? info.file.url_private!;
    filename = info.file.name;
    mimetype = info.file.mimetype;
    size = info.file.size;
    fileId = info.file.id;
  } else {
    downloadUrl = args.url!;
  }

  const dlRes = await fetch(downloadUrl, {
    headers: { authorization: `Bearer ${creds.access_token}` },
    redirect: "follow",
  });
  if (!dlRes.ok) {
    throw new SlackCliError({
      code: `download_${dlRes.status}`,
      message: `download failed: HTTP ${dlRes.status} ${dlRes.statusText}`,
      exitCode: dlRes.status === 401 || dlRes.status === 403 ? ExitCode.Auth : ExitCode.Network,
    });
  }
  const responseType = dlRes.headers.get("content-type") ?? "";
  const expectImageOrBinary = !mimetype || !mimetype.startsWith("text/html");
  if (expectImageOrBinary && responseType.startsWith("text/html")) {
    throw new SlackCliError({
      code: "missing_scope",
      message:
        "Slack returned an HTML login page instead of file bytes — the user token lacks files:read. Update the app manifest (slack-cli app manifest) and re-run slack-cli login.",
      exitCode: ExitCode.Auth,
      neededScope: "files:read",
    });
  }
  const buf = new Uint8Array(await dlRes.arrayBuffer());

  await mkdir(dirname(args.out), { recursive: true });
  await Bun.write(args.out, buf);

  emit(args.output, {
    ok: true,
    file_id: fileId,
    name: filename,
    mimetype,
    size: size ?? buf.byteLength,
    bytes_written: buf.byteLength,
    path: args.out,
  });
}

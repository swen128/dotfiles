import { buildManifest } from "../slack/manifest.ts";

export interface AppManifestArgs {
  port: number;
}

export function appManifestCommand(args: AppManifestArgs): void {
  process.stdout.write(buildManifest(args.port));
}

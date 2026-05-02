export const USER_SCOPES = [
  "search:read",
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "channels:read",
  "groups:read",
  "im:read",
  "mpim:read",
  "im:write",
  "mpim:write",
  "chat:write",
  "users:read",
  "users.profile:read",
  "team:read",
  "files:read",
] as const;

export function buildManifest(port: number): string {
  return `display_information:
  name: slack-cli
  description: CLI for Slack, designed for AI agents
  background_color: "#1d1d1d"
oauth_config:
  redirect_urls:
    - http://127.0.0.1:${port}/oauth/callback
  scopes:
    user:
${USER_SCOPES.map((s) => `      - ${s}`).join("\n")}
settings:
  token_rotation_enabled: true
  org_deploy_enabled: false
  socket_mode_enabled: false
  is_hosted: false
`;
}

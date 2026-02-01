Add or edit OpenCode settings (MCP servers or plugins) according to the user request.

First, ask the user (if not already specified):
1. What type of setting: **mcp** or **plugin**?
2. Whether it is **user-scope** or **project-scope**?

Then read the appropriate documentation:
- MCP: https://raw.githubusercontent.com/anomalyco/opencode/refs/heads/dev/packages/web/src/content/docs/mcp-servers.mdx
- Plugins: https://raw.githubusercontent.com/anomalyco/opencode/refs/heads/dev/packages/web/src/content/docs/plugins.mdx

Edit the configuration based on scope:

| Type   | User-scope path                                                  | Project-scope path                    |
|--------|------------------------------------------------------------------|---------------------------------------|
| MCP    | `~/.local/share/chezmoi/home/dot_config/opencode/opencode.jsonc` | `<project-root>/opencode.json`        |
| Plugin | `~/.local/share/chezmoi/home/dot_config/opencode/plugin/`        | `<project-root>/.opencode/plugin/`    |

If user-scope, run `chezmoi apply --force` after editing.

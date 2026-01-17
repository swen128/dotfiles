Add or edit an MCP server configuration according to the user request.

First, ask the user (if not already specified) whether the MCP server is user-scope or project-scope.

Then read: https://raw.githubusercontent.com/anomalyco/opencode/refs/heads/dev/packages/web/src/content/docs/mcp-servers.mdx

If the MCP server is user-scope, edit the configuration at ~/.local/share/chezmoi/home/dot_config/opencode/opencode.jsonc
and then run `chezmoi apply --force`.
Otherwise, edit the opencode.jsonc at the project root following the document.

## User Request
$ARGUMENTS

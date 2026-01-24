Add or edit OpenCode plugin(s) according to the user request.

First, ask the user (if not already specified) whether the plugin is user-scope or project-scope.

Then read: https://raw.githubusercontent.com/anomalyco/opencode/refs/heads/dev/packages/web/src/content/docs/plugins.mdx

If the plugin is user-scope, implement the plugin at `~/.local/share/chezmoi/home/dot_config/opencode/plugin`
and then run `chezmoi apply --force`.
Otherwise, write the plugin at the appropriate location following the document.

## User Request
$ARGUMENTS

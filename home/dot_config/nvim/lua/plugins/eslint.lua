return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        eslint = {
          -- Use bun to run the ESLint language server for native TypeScript support.
          -- This avoids "Unknown file extension .ts" errors when the project's Node
          -- version (via mise) doesn't support TypeScript imports.
          cmd = { "bun", "run", vim.fn.stdpath("data") .. "/mason/packages/eslint-lsp/node_modules/.bin/vscode-eslint-language-server", "--stdio" },
        },
      },
    },
  },
}

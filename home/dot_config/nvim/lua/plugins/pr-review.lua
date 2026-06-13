return {
  {
    dir = vim.fn.stdpath("config") .. "/local-plugins/pr-review",
    name = "pr-review",
    cmd = "Pr",
    dependencies = { "ibhagwan/fzf-lua" },
    opts = {},
  },
}

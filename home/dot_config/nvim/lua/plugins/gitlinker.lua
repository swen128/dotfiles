return {
  {
    "linrongbin16/gitlinker.nvim",
    cmd = "GitLink",
    opts = {
      mappings = nil,
    },
    keys = {
      {
        "<leader>fyg",
        "<cmd>GitLink<cr>",
        mode = { "n", "v" },
        desc = "Copy link to GitHub repository",
      },
    },
  },
}

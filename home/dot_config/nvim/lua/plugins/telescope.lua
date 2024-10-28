return {
  "nvim-telescope/telescope.nvim",
  opts = {
    defaults = {
      path_display = { "smart" },
      dynamic_preview_title = true,
      layout_strategy = "vertical",
    },
  },
  keys = {
    -- Keymap for telescope-sg, which integrates ast-grep into telescope.
    { "<leader>sa", "<cmd>Telescope ast_grep<cr>", desc = "AST grep" },
  },
}

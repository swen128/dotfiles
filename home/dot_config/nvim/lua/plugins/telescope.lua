return {
  "nvim-telescope/telescope.nvim",
  keys = {
    -- Keymap for telescope-sg, which integrates ast-grep into telescope.
    { "<leader>sa", "<cmd>Telescope ast_grep<cr>", desc = "AST grep" },
  },
}

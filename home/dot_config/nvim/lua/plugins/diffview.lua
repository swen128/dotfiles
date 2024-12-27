return {
  "sindrets/diffview.nvim",
  opts = {
    keymaps = {
      file_panel = {
        ["q"] = "<cmd>DiffviewClose<CR>",
      },
      file_history_panel = {
        ["q"] = "<cmd>DiffviewClose<CR>",
      },
    },
  },
  config = function()
    -- Review a PR for the current branch.
    -- ref: https://github.com/sindrets/diffview.nvim/blob/main/USAGE.md#review-a-pr
    vim.api.nvim_create_user_command("DiffviewPr", function()
      local remote_name = "origin"
      local base_ref = vim.fn.system("gh pr view --json baseRefName -q '.baseRefName'"):gsub("\n", "")
      local range = remote_name .. "/" .. base_ref .. "...HEAD"
      require("diffview").open({ range, "--imply-local" })
    end, {})

    vim.keymap.set("n", "<leader>gd", "<Cmd>DiffviewOpen<CR>", { desc = "Git: Diff" })
    vim.keymap.set("n", "<leader>gp", "<Cmd>DiffviewPr<CR>", { desc = "Git: Review a PR" })
    vim.keymap.set("n", "<leader>gf", "<Cmd>DiffviewFileHistory %<CR>", { desc = "Git: File history" })
    vim.keymap.set("v", "<leader>gf", ":'<,'>DiffviewFileHistory<CR>", { desc = "Git: Range history" })
  end,
}

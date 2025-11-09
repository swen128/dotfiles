return {
  "sindrets/diffview.nvim",
  opts = {
    keymaps = {
      file_panel = {
        { "n", "q", "<cmd>DiffviewClose<CR>", { desc = "Close Diffview" } },
      },
      file_history_panel = {
        { "n", "q", "<cmd>DiffviewClose<CR>", { desc = "Close Diffview" } },
        {
          "n",
          "o",
          function()
            local lib = require("diffview.lib")
            local view = lib.get_current_view()
            if view then
              local entry = view.panel:get_item_at_cursor()
              if entry and entry.commit then
                vim.fn.system("gh browse " .. entry.commit.hash)
              end
            end
          end,
          { desc = "Open commit on GitHub" },
        },
      },
    },
  },
  config = function(_, opts)
    require("diffview").setup(opts)

    -- Review a PR for the current branch.
    -- ref: https://github.com/sindrets/diffview.nvim/blob/main/USAGE.md#review-a-pr
    vim.api.nvim_create_user_command("DiffviewPr", function()
      local remote_name = "origin"
      local base_ref = vim.fn.system("gh pr view --json baseRefName -q '.baseRefName'"):gsub("\n", "")
      local range = remote_name .. "/" .. base_ref .. "...HEAD"
      require("diffview").open({ range, "--imply-local" })
    end, {})
  end,
}

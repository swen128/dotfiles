return {
  "ibhagwan/fzf-lua",
  config = function()
    require("fzf-lua").setup({
      formatter = "path.filename_first",
      winopts = {
        preview = {
          layout = "flex",
          flip_columns = 150,
        },
      },
    })

    -- zoxide integration
    vim.keymap.set("n", "<leader>z", function()
      require("fzf-lua").fzf_live("zoxide query -l", {
        prompt = "zoxide> ",
        actions = {
          ["default"] = function(selected)
            local dir = selected[1] or ""
            if dir ~= "" then
              vim.cmd("cd " .. vim.fn.fnameescape(dir))
              print("Changed directory to: " .. dir)
            end
          end,
        },
      })
    end, { desc = "Zoxide Jump" })
  end,
}

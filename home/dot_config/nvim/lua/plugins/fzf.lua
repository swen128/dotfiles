return {
  "ibhagwan/fzf-lua",
  init = function()
    vim.api.nvim_create_user_command("Nb", function(opts)
      if opts.args ~= "" then
        local path = vim.fn.system("nb show " .. vim.fn.shellescape(opts.args) .. " --path"):gsub("%s+$", "")
        if vim.v.shell_error == 0 and path ~= "" then
          vim.cmd("edit " .. vim.fn.fnameescape(path))
        else
          vim.notify("nb: note not found: " .. opts.args, vim.log.levels.ERROR)
        end
      else
        local nb_dir = vim.env.HOME .. "/.nb/"
        require("fzf-lua").fzf_exec("nb list --no-color --paths | sed 's|" .. nb_dir .. "||g'", {
          prompt = "nb> ",
          actions = {
            ["default"] = function(selected)
              local line = selected[1] or ""
              local rel = line:match("(%S+)%s*$") or line
              if rel ~= "" then
                vim.cmd("edit " .. vim.fn.fnameescape(nb_dir .. rel))
              end
            end,
          },
        })
      end
    end, { nargs = "?", desc = "Open note by ID or fuzzy find" })
  end,
  config = function()
    local actions = require("fzf-lua.actions")
    require("fzf-lua").setup({
      formatter = "path.filename_first",
      winopts = {
        preview = {
          layout = "flex",
          flip_columns = 150,
        },
      },
      actions = {
        files = {
          ["default"] = actions.file_edit,
          ["ctrl-y"] = function(selected)
            local path = require("fzf-lua").path.entry_to_file(selected[1])
            vim.fn.setreg("+", path.path)
          end,
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

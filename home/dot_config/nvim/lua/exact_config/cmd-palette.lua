local M = {}

---@class PaletteEntry
---@field text string
---@field on_selected fun(buf:number, win:number)

---@type PaletteEntry[]
M.custom = {
  {
    text = "󰊢 Copy git branch name",
    on_selected = function(buf)
      local branch = vim.g.gitsigns_head or vim.b[buf].gitsigns_head
      if not branch or #branch == 0 then
        vim.notify("Could not determine git branch", vim.log.levels.WARN)
        return
      end
      vim.fn.setreg("+", branch)
      vim.fn.setreg('"', branch)
      vim.notify(("Copied: %s"):format(branch))
    end,
  },
}

function M.open()
  local buf = vim.api.nvim_get_current_buf()
  local win = vim.api.nvim_get_current_win()
  local entries = {}

  local seen = {}

  for _, keymap in ipairs(vim.api.nvim_get_keymap("n")) do
    if keymap.desc and keymap.desc ~= "" and not seen[keymap.desc] then
      seen[keymap.desc] = true
      table.insert(entries, {
        text = keymap.desc,
        on_selected = function()
          vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(keymap.lhs, true, false, true), "m", false)
        end,
      })
    end
  end

  for _, keymap in ipairs(vim.api.nvim_buf_get_keymap(buf, "n")) do
    if keymap.desc and keymap.desc ~= "" and not seen[keymap.desc] then
      seen[keymap.desc] = true
      table.insert(entries, {
        text = keymap.desc,
        on_selected = function()
          vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(keymap.lhs, true, false, true), "m", false)
        end,
      })
    end
  end

  local cmds = vim.api.nvim_get_commands({})
  for name, cmd in pairs(cmds) do
    local desc = cmd.definition or ""
    table.insert(entries, {
      text = string.format(":%s  %s", name, desc),
      on_selected = function()
        vim.cmd(name)
      end,
    })
  end

  for _, entry in ipairs(M.custom) do
    table.insert(entries, entry)
  end

  table.sort(entries, function(a, b)
    return a.text < b.text
  end)

  require("fzf-lua").fzf_exec(
    vim.tbl_map(function(e)
      return e.text
    end, entries),
    {
      prompt = "Command Palette> ",
      actions = {
        ["default"] = function(selected)
          if not selected or #selected == 0 then
            return
          end
          for _, entry in ipairs(entries) do
            if entry.text == selected[1] then
              entry.on_selected(buf, win)
              return
            end
          end
        end,
      },
    }
  )
end

return M

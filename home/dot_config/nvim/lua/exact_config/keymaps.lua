-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

local Util = require("lazyvim.util")

local function copy_path_from_root()
  local file = vim.api.nvim_buf_get_name(0)
  if file == "" then
    vim.notify("Current buffer has no file on disk", vim.log.levels.WARN, { title = "Copy path" })
    return
  end

  local buf = vim.api.nvim_get_current_buf()
  local root = vim.loop.cwd()

  if Util and Util.root then
    if type(Util.root) == "table" and type(Util.root.get) == "function" then
      root = Util.root.get({ buf = buf }) or root
    elseif type(Util.root) == "function" then
      root = Util.root(buf) or root
    end
  end

  if not root or root == "" then
    root = vim.loop.cwd()
  end

  local absolute = vim.fs.normalize(file)
  local normalized_root = vim.fs.normalize(root)
  local prefix = normalized_root:sub(-1) == "/" and normalized_root or (normalized_root .. "/")
  local relative
  if absolute:sub(1, #prefix) == prefix then
    relative = absolute:sub(#prefix + 1)
  else
    relative = vim.fn.fnamemodify(file, ":t")
  end

  if not relative or relative == "" then
    relative = vim.fn.fnamemodify(file, ":t")
  end

  vim.fn.setreg("+", relative)
  vim.fn.setreg('"', relative)
  vim.notify(("Copied %s to clipboard"):format(relative), vim.log.levels.INFO, { title = "Copy path" })
end

vim.keymap.set("n", "<C-p>", function()
  require("config.cmd-palette").open()
end, { desc = "Command Palette" })

vim.keymap.set("n", "<leader>gd", "<Cmd>DiffviewOpen<CR>", { desc = "Git: Diff" })
vim.keymap.set("n", "<leader>gp", "<Cmd>DiffviewPr<CR>", { desc = "Git: Review a PR" })
vim.keymap.set("n", "<leader>gf", "<Cmd>DiffviewFileHistory %<CR>", { desc = "Git: File history" })
vim.keymap.set("v", "<leader>gf", ":'<,'>DiffviewFileHistory<CR>", { desc = "Git: Range history" })
vim.keymap.set("n", "<leader>fyp", copy_path_from_root, { desc = "Copy path from project root" })
vim.keymap.set("n", "<leader>fyP", function()
  local file = vim.api.nvim_buf_get_name(0)
  if file == "" then
    vim.notify("Current buffer has no file on disk", vim.log.levels.WARN, { title = "Copy path" })
    return
  end
  local absolute = vim.fs.normalize(file)
  vim.fn.setreg("+", absolute)
  vim.fn.setreg('"', absolute)
  vim.notify(("Copied %s to clipboard"):format(absolute), vim.log.levels.INFO, { title = "Copy path" })
end, { desc = "Copy absolute path" })

vim.api.nvim_create_user_command("Walkthrough", function(opts)
  require("walkthrough").start(opts.args)
end, { nargs = 1, complete = "file", desc = "Start walkthrough from JSON file" })
vim.api.nvim_create_user_command("WalkthroughNext", function() require("walkthrough").next() end, {})
vim.api.nvim_create_user_command("WalkthroughPrev", function() require("walkthrough").prev() end, {})
vim.api.nvim_create_user_command("WalkthroughClose", function() require("walkthrough").close() end, {})
vim.api.nvim_create_user_command("WalkthroughToggle", function() require("walkthrough").toggle_float() end, { desc = "Toggle walkthrough note float" })
vim.api.nvim_create_user_command("WalkthroughFocus", function() require("walkthrough").focus_float() end, { desc = "Focus walkthrough note float (yank text from it)" })
vim.api.nvim_create_user_command("WalkthroughStatus", function() require("walkthrough").status() end, {})
vim.api.nvim_create_user_command("WalkthroughGoto", function(opts)
  local idx = tonumber(opts.args)
  if not idx then
    vim.notify("Walkthrough: :WalkthroughGoto <step-number>", vim.log.levels.ERROR)
    return
  end
  require("walkthrough").goto_step(idx)
end, { nargs = 1, desc = "Jump to walkthrough step N" })

vim.keymap.set("n", "]w", function() require("walkthrough").next() end, { desc = "Walkthrough: next step" })
vim.keymap.set("n", "[w", function() require("walkthrough").prev() end, { desc = "Walkthrough: prev step" })
vim.keymap.set("n", "<leader>wq", function() require("walkthrough").close() end, { desc = "Walkthrough: close" })
vim.keymap.set("n", "<leader>wt", function() require("walkthrough").toggle_float() end, { desc = "Walkthrough: toggle note float" })
vim.keymap.set("n", "<leader>w<CR>", function() require("walkthrough").focus_float() end, { desc = "Walkthrough: focus note float" })
vim.keymap.set("n", "<leader>wR", function() require("walkthrough").reload() end, { desc = "Walkthrough: reload + restart" })
vim.keymap.set("n", "<leader>wg", function()
  local n = vim.v.count
  if n == 0 then
    vim.notify("Walkthrough: prefix with step number, e.g. 3<leader>wg", vim.log.levels.WARN)
    return
  end
  require("walkthrough").goto_step(n)
end, { desc = "Walkthrough: goto step [count]" })

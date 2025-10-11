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

vim.keymap.set("n", "<leader>gd", "<Cmd>DiffviewOpen<CR>", { desc = "Git: Diff" })
vim.keymap.set("n", "<leader>gp", "<Cmd>DiffviewPr<CR>", { desc = "Git: Review a PR" })
vim.keymap.set("n", "<leader>gf", "<Cmd>DiffviewFileHistory %<CR>", { desc = "Git: File history" })
vim.keymap.set("v", "<leader>gf", ":'<,'>DiffviewFileHistory<CR>", { desc = "Git: Range history" })
vim.keymap.set("n", "<leader>fyp", copy_path_from_root, { desc = "Copy path from project root" })

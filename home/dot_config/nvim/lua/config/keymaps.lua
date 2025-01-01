-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

vim.keymap.set("n", "<leader>gd", "<Cmd>DiffviewOpen<CR>", { desc = "Git: Diff" })
vim.keymap.set("n", "<leader>gp", "<Cmd>DiffviewPr<CR>", { desc = "Git: Review a PR" })
vim.keymap.set("n", "<leader>gf", "<Cmd>DiffviewFileHistory %<CR>", { desc = "Git: File history" })
vim.keymap.set("v", "<leader>gf", ":'<,'>DiffviewFileHistory<CR>", { desc = "Git: Range history" })


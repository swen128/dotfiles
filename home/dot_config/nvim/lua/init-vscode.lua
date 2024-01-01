local vscode = require("vscode-neovim")

-- [G]oto [R]eference
vim.keymap.set("n", "gr", function()
  vscode.call("editor.action.referenceSearch.trigger")
end)

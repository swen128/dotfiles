if vim.g.loaded_pr_review then
  return
end
vim.g.loaded_pr_review = true

vim.api.nvim_create_user_command("Pr", function(o)
  require("pr-review").dispatch(o)
end, {
  nargs = "*",
  range = true,
  complete = function(_, cmdline)
    if cmdline:match("^%s*Pr%s+%S+%s") then
      return {}
    end
    return vim.tbl_keys(require("pr-review").subcommands)
  end,
  desc = "GitHub PR review",
})

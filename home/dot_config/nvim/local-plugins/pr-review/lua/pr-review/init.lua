local M = {}

function M.setup(opts)
  require("pr-review.config").setup(opts)
end

M.subcommands = {
  dash = function()
    require("pr-review.dash").show()
  end,
  open = function(o)
    require("pr-review.pr").open(tonumber(o.fargs[2]))
  end,
  files = function()
    require("pr-review.review").pick_file()
  end,
  comment = function(o)
    if o.range and o.range > 0 then
      require("pr-review.comments").add_comment(o.line1, o.line2)
    else
      require("pr-review.comments").add_comment()
    end
  end,
  thread = function()
    require("pr-review.comments").show_thread_at_cursor()
  end,
  threads = function()
    require("pr-review.comments").pick_thread()
  end,
  refresh = function()
    require("pr-review.pr").refresh()
  end,
  submit = function()
    require("pr-review.pr").submit()
  end,
  discard = function()
    require("pr-review.pr").discard_pending()
  end,
  status = function()
    require("pr-review.pr").status()
  end,
  checkout = function()
    require("pr-review.pr").checkout()
  end,
  merge = function()
    require("pr-review.pr").merge()
  end,
  automerge = function()
    require("pr-review.pr").automerge()
  end,
  draft = function()
    require("pr-review.pr").draft()
  end,
  viewed = function()
    local path = vim.b.pr_path
    if path then
      require("pr-review.pr").toggle_viewed(path)
    else
      vim.notify("pr-review: not a review buffer", vim.log.levels.WARN)
    end
  end,
  close = function()
    require("pr-review.pr").close()
  end,
}

function M.dispatch(o)
  local sub = o.fargs[1] or "dash"
  local handler = M.subcommands[sub]
  if not handler then
    vim.notify("pr-review: unknown subcommand: " .. sub, vim.log.levels.ERROR)
    return
  end
  handler(o)
end

return M

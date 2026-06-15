local M = {}

M.defaults = {
  -- Applied buffer-locally to review buffers only; set a key to false to disable it.
  keymaps = {
    files = "<leader>rf",
    comment = "<leader>rc",
    thread = "<leader>rt",
    threads = "<leader>rT",
    submit = "<leader>rs",
    refresh = "<leader>rr",
    draft = "<leader>rd",
    viewed = "<leader>rv",
    next_comment = "]C",
    prev_comment = "[C",
    next_file = "]F",
    prev_file = "[F",
  },
  sign_text = "󰅺",
  auto_mark_viewed = true,
  skip_viewed = false,
  dash = {
    limit = 30,
    sections = {
      { title = " Needs your review", search = "review-requested:@me" },
      { title = " Created by you", search = "author:@me" },
    },
  },
}

M.options = vim.deepcopy(M.defaults)

function M.setup(opts)
  M.options = vim.tbl_deep_extend("force", vim.deepcopy(M.defaults), opts or {})
end

return M

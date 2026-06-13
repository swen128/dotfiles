local M = {}

local function centered_geometry(width, height)
  width = math.max(40, math.min(width, vim.o.columns - 8))
  height = math.max(3, math.min(height, vim.o.lines - 8))
  return {
    relative = "editor",
    width = width,
    height = height,
    row = math.floor((vim.o.lines - height) / 2),
    col = math.floor((vim.o.columns - width) / 2),
    border = "rounded",
    title_pos = "center",
  }
end

local function new_scratch()
  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].buftype = "nofile"
  vim.bo[buf].bufhidden = "wipe"
  vim.bo[buf].swapfile = false
  return buf
end

function M.compose(opts)
  local buf = new_scratch()
  vim.bo[buf].filetype = "markdown"
  local initial = opts.initial or ""
  if initial ~= "" then
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, vim.split(initial, "\n"))
  end

  local geo = centered_geometry(80, 12)
  geo.title = " " .. (opts.title or "Comment") .. " "
  geo.footer = " " .. (opts.footer or "<C-s> submit") .. " · q cancel "
  local win = vim.api.nvim_open_win(buf, true, geo)
  vim.wo[win].wrap = true

  local function close()
    if vim.api.nvim_win_is_valid(win) then
      vim.api.nvim_win_close(win, true)
    end
  end

  local function run(fn)
    return function()
      local text = vim.trim(table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "\n"))
      if text == "" and not opts.allow_empty then
        vim.notify("pr-review: message is empty (q to cancel)", vim.log.levels.WARN)
        return
      end
      close()
      fn(text)
    end
  end

  vim.keymap.set({ "n", "i" }, "<C-s>", run(opts.on_submit), { buffer = buf })
  if opts.on_submit_alt then
    local alt = run(opts.on_submit_alt)
    vim.keymap.set({ "n", "i" }, "<C-a>", alt, { buffer = buf })
    vim.keymap.set({ "n", "i" }, "<C-CR>", alt, { buffer = buf })
  end
  vim.keymap.set("n", "q", close, { buffer = buf })
  if initial == "" then
    vim.cmd.startinsert()
  end
end

function M.float(lines, opts)
  opts = opts or {}
  local buf = new_scratch()
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].modifiable = false
  vim.bo[buf].filetype = opts.filetype or "markdown"

  local width = 0
  for _, l in ipairs(lines) do
    width = math.max(width, vim.fn.strdisplaywidth(l))
  end
  local geo = centered_geometry(math.min(width + 2, 100), #lines)
  if opts.title then
    geo.title = " " .. opts.title .. " "
  end
  if opts.footer then
    geo.footer = " " .. opts.footer .. " "
  end
  local win = vim.api.nvim_open_win(buf, true, geo)
  vim.wo[win].wrap = opts.wrap ~= false

  local function close()
    if vim.api.nvim_win_is_valid(win) then
      vim.api.nvim_win_close(win, true)
    end
  end
  vim.keymap.set("n", "q", close, { buffer = buf })
  vim.keymap.set("n", "<Esc>", close, { buffer = buf })
  return buf, win, close
end

return M

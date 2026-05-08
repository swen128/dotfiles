local M = {}

local ns_marker = vim.api.nvim_create_namespace("walkthrough_marker")
local ns_values = vim.api.nvim_create_namespace("walkthrough_values")
local ns_float = vim.api.nvim_create_namespace("walkthrough_float")

vim.api.nvim_set_hl(0, "WalkthroughLocator", { link = "Title", default = true })
vim.api.nvim_set_hl(0, "WalkthroughSeparator", { link = "FloatBorder", default = true })

local state = {
  steps = nil,
  index = 1,
  description = nil,
  commit = nil,
  last_path = nil,
  float_win = nil,
  float_buf = nil,
  root = nil,
}

local function close_float()
  if state.float_win and vim.api.nvim_win_is_valid(state.float_win) then
    vim.api.nvim_win_close(state.float_win, true)
  end
  state.float_win = nil
  state.float_buf = nil
end

local function clear_marks()
  for _, b in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(b) then
      vim.api.nvim_buf_clear_namespace(b, ns_marker, 0, -1)
      vim.api.nvim_buf_clear_namespace(b, ns_values, 0, -1)
    end
  end
end

local function place_marker(bufnr, line, idx, total)
  local count = vim.api.nvim_buf_line_count(bufnr)
  if line < 1 or line > count then
    vim.notify(
      string.format("Walkthrough: step %d line %d out of range (file has %d lines)", idx, line, count),
      vim.log.levels.WARN
    )
    return
  end
  pcall(vim.api.nvim_buf_set_extmark, bufnr, ns_marker, line - 1, 0, {
    sign_text = "▶ ",
    sign_hl_group = "DiagnosticHint",
    line_hl_group = "Visual",
    virt_text = { { string.format("  ● step %d/%d", idx, total), "Comment" } },
    virt_text_pos = "eol",
  })
end

local function place_values(bufnr, step)
  if type(step.values) ~= "table" or #step.values == 0 then return end

  local count = vim.api.nvim_buf_line_count(bufnr)
  local groups = {}
  local skipped = {}

  for _, v in ipairs(step.values) do
    if type(v.line) ~= "number" or v.line < 1 then
      table.insert(skipped, string.format("%s (no 'line')", v.name or "?"))
    elseif v.line > count then
      table.insert(skipped, string.format("%s (line %d > %d)", v.name or "?", v.line, count))
    else
      groups[v.line] = groups[v.line] or {}
      table.insert(groups[v.line], v)
    end
  end

  for ln, vs in pairs(groups) do
    local parts = { { "  ┊ ", "Comment" } }
    for i, v in ipairs(vs) do
      if i > 1 then table.insert(parts, { "   ", "Comment" }) end
      table.insert(parts, { tostring(v.name or ""), "Identifier" })
      table.insert(parts, { " = ", "Comment" })
      table.insert(parts, { tostring(v.value), "String" })
    end
    pcall(vim.api.nvim_buf_set_extmark, bufnr, ns_values, ln - 1, 0, {
      virt_text = parts,
      virt_text_pos = "eol",
      hl_mode = "combine",
    })
  end

  if #skipped > 0 then
    vim.notify("Walkthrough: skipped values — " .. table.concat(skipped, ", "), vim.log.levels.WARN)
  end
end

local function wrap_line(line, max_width)
  if line == "" or vim.fn.strdisplaywidth(line) <= max_width then
    return { line }
  end
  local out = {}
  local current = ""
  local function flush()
    if current ~= "" then
      table.insert(out, current)
      current = ""
    end
  end
  local function push_word(word)
    local candidate = current == "" and word or (current .. " " .. word)
    if vim.fn.strdisplaywidth(candidate) <= max_width then
      current = candidate
      return
    end
    flush()
    if vim.fn.strdisplaywidth(word) <= max_width then
      current = word
      return
    end
    local chunk = ""
    for ch in word:gmatch("[%z\1-\127\194-\244][\128-\191]*") do
      if vim.fn.strdisplaywidth(chunk .. ch) > max_width then
        table.insert(out, chunk)
        chunk = ch
      else
        chunk = chunk .. ch
      end
    end
    current = chunk
  end
  for word in line:gmatch("%S+") do
    push_word(word)
  end
  flush()
  if #out == 0 then table.insert(out, "") end
  return out
end

local function show_float(step, idx, total)
  close_float()

  local locator = string.format("  ▎ %d / %d   %s:%d", idx, total, step.file, step.line)

  local max_width = math.max(20, math.floor(vim.o.columns * 0.7) - 2)
  local lines = {}
  for _, sub in ipairs(wrap_line(locator, max_width)) do
    table.insert(lines, sub)
  end
  local locator_lines = #lines

  local sep_width = 0
  for _, l in ipairs(lines) do
    sep_width = math.max(sep_width, vim.fn.strdisplaywidth(l))
  end
  table.insert(lines, string.rep("━", math.min(sep_width, max_width)))
  local sep_line = #lines

  local note_raw = {}
  for line in (step.note or ""):gmatch("([^\n]*)\n?") do
    if line ~= "" or #note_raw > 0 then
      table.insert(note_raw, line)
    end
  end
  if #note_raw > 0 and note_raw[#note_raw] == "" then
    table.remove(note_raw)
  end
  for _, l in ipairs(note_raw) do
    for _, sub in ipairs(wrap_line(l, max_width)) do
      table.insert(lines, sub)
    end
  end

  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].modifiable = false
  vim.bo[buf].bufhidden = "wipe"
  vim.bo[buf].filetype = "markdown"

  for i = 0, locator_lines - 1 do
    pcall(vim.api.nvim_buf_set_extmark, buf, ns_float, i, 0, { line_hl_group = "WalkthroughLocator" })
  end
  pcall(vim.api.nvim_buf_set_extmark, buf, ns_float, sep_line - 1, 0, { line_hl_group = "WalkthroughSeparator" })

  local width = 0
  for _, l in ipairs(lines) do
    if vim.fn.strdisplaywidth(l) > width then
      width = vim.fn.strdisplaywidth(l)
    end
  end
  width = math.min(width + 2, math.floor(vim.o.columns * 0.7))
  local max_height = math.max(5, math.floor(vim.o.lines * 0.7))
  local height = math.min(#lines, max_height)

  local win = vim.api.nvim_open_win(buf, false, {
    relative = "editor",
    anchor = "NE",
    row = 1,
    col = vim.o.columns - 1,
    width = width,
    height = height,
    style = "minimal",
    border = "rounded",
    focusable = true,
    noautocmd = true,
  })
  vim.wo[win].winhighlight = "Normal:NormalFloat,FloatBorder:FloatBorder"

  vim.keymap.set("n", "q", function()
    pcall(vim.cmd, "wincmd p")
  end, { buffer = buf, nowait = true, silent = true, desc = "Walkthrough: leave float" })

  state.float_win = win
  state.float_buf = buf
end

local function resolve_path(file)
  if vim.fn.filereadable(file) == 1 then
    return vim.fn.fnamemodify(file, ":p")
  end
  if state.root then
    local p = state.root .. "/" .. file
    if vim.fn.filereadable(p) == 1 then
      return p
    end
  end
  return nil
end

local function jump_to(idx)
  if not state.steps then
    vim.notify("Walkthrough: no walkthrough loaded", vim.log.levels.WARN)
    return
  end
  if idx < 1 or idx > #state.steps then
    vim.notify(string.format("Walkthrough: out of range (1..%d)", #state.steps), vim.log.levels.WARN)
    return
  end

  local step = state.steps[idx]
  if type(step.file) ~= "string" or step.file == "" then
    vim.notify(string.format("Walkthrough: step %d has no 'file'", idx), vim.log.levels.ERROR)
    return
  end
  local path = resolve_path(step.file)
  if not path then
    vim.notify(
      string.format("Walkthrough: step %d file not found: %s (root: %s)", idx, step.file, state.root or "?"),
      vim.log.levels.ERROR
    )
    return
  end

  state.index = idx

  local existing = vim.fn.bufnr(path)
  if existing ~= -1 and vim.api.nvim_buf_is_loaded(existing) then
    vim.api.nvim_set_current_buf(existing)
  else
    local ok, err = pcall(vim.cmd, "edit " .. vim.fn.fnameescape(path))
    if not ok then
      vim.notify("Walkthrough: edit error (continuing): " .. tostring(err), vim.log.levels.WARN)
    end
  end

  local line = math.max(1, step.line or 1)
  pcall(vim.api.nvim_win_set_cursor, 0, { line, 0 })
  pcall(vim.cmd, "normal! zz")

  clear_marks()
  local bufnr = vim.api.nvim_get_current_buf()
  place_marker(bufnr, line, idx, #state.steps)
  place_values(bufnr, step)

  show_float(step, idx, #state.steps)
end

function M.start(json_path)
  json_path = vim.fn.fnamemodify(json_path, ":p")
  local f = io.open(json_path, "r")
  if not f then
    vim.notify("Walkthrough: cannot read " .. json_path, vim.log.levels.ERROR)
    return
  end
  local content = f:read("*a")
  f:close()

  local ok, data = pcall(vim.json.decode, content)
  if not ok then
    vim.notify("Walkthrough: invalid JSON: " .. tostring(data), vim.log.levels.ERROR)
    return
  end
  if type(data.steps) ~= "table" or #data.steps == 0 then
    vim.notify("Walkthrough: no steps", vim.log.levels.ERROR)
    return
  end

  state.steps = data.steps
  state.description = data.description
  state.commit = data.commit
  state.last_path = json_path
  state.index = 1

  local root = vim.fn.systemlist({
    "git",
    "-C",
    vim.fn.fnamemodify(json_path, ":h"),
    "rev-parse",
    "--show-toplevel",
  })[1]
  if vim.v.shell_error == 0 and root and #root > 0 then
    state.root = root
  else
    state.root = vim.fn.fnamemodify(json_path, ":h")
  end

  jump_to(1)
end

function M.next()
  jump_to(state.index + 1)
end

function M.prev()
  jump_to(state.index - 1)
end

function M.goto_step(idx)
  jump_to(idx)
end

function M.status()
  if not state.steps then
    vim.notify("Walkthrough: no walkthrough loaded", vim.log.levels.INFO)
    return
  end
  vim.notify(
    string.format(
      "Walkthrough: [%d/%d] @ %s",
      state.index,
      #state.steps,
      state.commit or "unknown commit"
    ),
    vim.log.levels.INFO
  )
end

function M.close()
  close_float()
  clear_marks()
end

function M.focus_float()
  if not (state.float_win and vim.api.nvim_win_is_valid(state.float_win)) then
    if not state.steps then
      vim.notify("Walkthrough: no walkthrough loaded", vim.log.levels.WARN)
      return
    end
    show_float(state.steps[state.index], state.index, #state.steps)
  end
  if state.float_win and vim.api.nvim_win_is_valid(state.float_win) then
    vim.api.nvim_set_current_win(state.float_win)
  end
end

function M.toggle_float()
  if state.float_win and vim.api.nvim_win_is_valid(state.float_win) then
    close_float()
    return
  end
  if not state.steps then
    vim.notify("Walkthrough: no walkthrough loaded", vim.log.levels.WARN)
    return
  end
  show_float(state.steps[state.index], state.index, #state.steps)
end

function M.reload()
  if not state.last_path then
    vim.notify("Walkthrough: no previous walkthrough to reload", vim.log.levels.WARN)
    return
  end
  local path = state.last_path
  package.loaded.walkthrough = nil
  require("walkthrough").start(path)
end

return M

local pr = require("pr-review.pr")
local config = require("pr-review.config")

local M = {}

local STATUS_ICON = {
  added = "A",
  modified = "M",
  removed = "D",
  renamed = "R",
  copied = "C",
  changed = "M",
  unchanged = "·",
}

local function notify(msg, lvl)
  vim.notify("pr-review: " .. msg, lvl or vim.log.levels.INFO)
end

local function delete_buf_by_name(name)
  for _, b in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_get_name(b) == name then
      pcall(vim.api.nvim_buf_delete, b, { force = true })
    end
  end
end

local function scratch_buf(name, lines, path)
  delete_buf_by_name(name)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].buftype = "nofile"
  vim.bo[buf].swapfile = false
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.api.nvim_buf_set_name(buf, name)
  vim.bo[buf].modifiable = false
  local ft = vim.filetype.match({ filename = path })
  if ft then
    vim.bo[buf].filetype = ft
  end
  return buf
end

function M.attach(buf, path, side)
  vim.b[buf].pr_path = path
  vim.b[buf].pr_side = side
  local km = config.options.keymaps
  local comments = require("pr-review.comments")
  local function map(mode, lhs, rhs, desc)
    if lhs then
      vim.keymap.set(mode, lhs, rhs, { buffer = buf, desc = "pr-review: " .. desc })
    end
  end
  map("n", km.files, M.pick_file, "pick file")
  map("n", km.comment, function()
    comments.add_comment()
  end, "comment on line")
  map("x", km.comment, function()
    local l1, l2 = vim.fn.line("v"), vim.fn.line(".")
    vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<Esc>", true, false, true), "n", false)
    comments.add_comment(math.min(l1, l2), math.max(l1, l2))
  end, "comment on range")
  map("n", km.thread, comments.show_thread_at_cursor, "show thread")
  map("n", km.threads, comments.pick_thread, "pick thread")
  map("n", km.submit, pr.submit, "submit review")
  map("n", km.refresh, pr.refresh, "refresh PR")
  map("n", km.viewed, function()
    pr.toggle_viewed(path)
  end, "toggle file viewed")
  map("n", km.next_comment, function()
    comments.jump(1)
  end, "next comment")
  map("n", km.prev_comment, function()
    comments.jump(-1)
  end, "prev comment")
  map("n", km.next_file, function()
    M.step_file(1)
  end, "next file")
  map("n", km.prev_file, function()
    M.step_file(-1)
  end, "prev file")
end

function M.step_file(dir)
  local st = pr.state
  if not st then
    return
  end
  if config.options.auto_mark_viewed and st.current then
    local cur = st.files[st.current]
    if cur and not pr.is_viewed(cur.filename) then
      pr.set_viewed(cur.filename, true, function()
        require("pr-review.comments").decorate_all()
      end)
    end
  end
  local idx = (st.current or (dir > 0 and 0 or #st.files + 1)) + dir
  while st.files[idx] do
    if not (config.options.skip_viewed and pr.is_viewed(st.files[idx].filename)) then
      M.open_file(idx)
      return
    end
    idx = idx + dir
  end
  notify("no more files")
end

local function ensure_tab()
  local st = pr.state
  if st.tabpage and vim.api.nvim_tabpage_is_valid(st.tabpage) then
    vim.api.nvim_set_current_tabpage(st.tabpage)
  else
    vim.cmd("tabnew")
    st.tabpage = vim.api.nvim_get_current_tabpage()
  end
end

function M.open_file(idx)
  local st = pr.state
  if not st then
    notify("no active review session — run :Pr open", vim.log.levels.WARN)
    return
  end
  local file = st.files[idx]
  if not file then
    notify("no more files", vim.log.levels.WARN)
    return
  end
  if not st.ready then
    notify("preparing working tree…")
    pr.when_ready(function()
      M.open_file(idx)
    end)
    return
  end
  st.current = idx

  ensure_tab()
  vim.cmd("silent! only")

  local workdir = (st.workdir and st.workdir ~= "") and st.workdir or st.root
  local abs = workdir .. "/" .. file.filename
  if file.status == "removed" then
    local buf = scratch_buf("pr-review://removed/" .. file.filename, {}, file.filename)
    vim.api.nvim_win_set_buf(0, buf)
  else
    if not vim.uv.fs_stat(abs) then
      notify("file not found: " .. abs, vim.log.levels.ERROR)
    end
    vim.cmd.edit(vim.fn.fnameescape(abs))
    if workdir ~= st.root then
      vim.bo.readonly = true
    end
  end
  local right_win = vim.api.nvim_get_current_win()
  local right_buf = vim.api.nvim_get_current_buf()
  M.attach(right_buf, file.filename, "RIGHT")

  local base_lines = pr.base_content(file)
  local left_buf = scratch_buf("pr-review://base/" .. file.filename, base_lines, file.filename)
  vim.cmd("leftabove vertical split")
  local left_win = vim.api.nvim_get_current_win()
  vim.api.nvim_win_set_buf(left_win, left_buf)
  M.attach(left_buf, file.filename, "LEFT")

  vim.api.nvim_win_call(left_win, function()
    vim.cmd("diffthis")
  end)
  vim.api.nvim_win_call(right_win, function()
    vim.cmd("diffthis")
  end)
  vim.api.nvim_set_current_win(right_win)
  st.wins = { LEFT = left_win, RIGHT = right_win }

  local comments = require("pr-review.comments")
  comments.decorate(left_buf)
  comments.decorate(right_buf)

  notify(("[%d/%d] %s %s%s  +%d -%d"):format(
    idx,
    #st.files,
    STATUS_ICON[file.status] or "?",
    pr.is_viewed(file.filename) and "✓ " or "",
    file.filename,
    file.additions or 0,
    file.deletions or 0
  ))
end

function M.open_location(path, side, line)
  local st = pr.state
  if not st then
    return
  end
  for idx, f in ipairs(st.files) do
    if f.filename == path then
      M.open_file(idx)
      local win = st.wins and st.wins[side or "RIGHT"]
      if win and vim.api.nvim_win_is_valid(win) then
        vim.api.nvim_set_current_win(win)
        pcall(vim.api.nvim_win_set_cursor, win, { line, 0 })
      end
      return true
    end
  end
  notify("file not in this PR: " .. path, vim.log.levels.WARN)
end

local function file_label(f)
  local comments = require("pr-review.comments")
  local n = comments.count_for_path(f.filename)
  return ("%s %s %s  +%d -%d%s"):format(
    pr.is_viewed(f.filename) and "✓" or " ",
    STATUS_ICON[f.status] or "?",
    f.filename,
    f.additions or 0,
    f.deletions or 0,
    n > 0 and ("  " .. config.options.sign_text .. " " .. n) or ""
  )
end

function M.pick_file()
  local st = pr.state
  if not st then
    pr.open()
    return
  end
  local prompt = ("PR #%d — changed files (%d/%d viewed)"):format(st.pr.number, pr.viewed_count(), #st.files)
  local workdir = (st.workdir and st.workdir ~= "") and st.workdir or st.root
  local base = st.merge_base or ("origin/" .. st.pr.baseRefName)

  local entries = {}
  for idx, f in ipairs(st.files) do
    entries[#entries + 1] = table.concat({ idx, f.filename, file_label(f) }, "\t")
  end
  require("fzf-lua").fzf_exec(entries, {
    prompt = "PR Files> ",
    fzf_opts = {
      ["--delimiter"] = "\\t",
      ["--with-nth"] = "3..",
      ["--preview"] = (function()
        local diff = ("git -C %s diff %s -- {2} 2>/dev/null"):format(vim.fn.shellescape(workdir), vim.fn.shellescape(base))
        if vim.fn.executable("delta") == 1 then
          return diff .. [[ | delta --paging=never --width=${FZF_PREVIEW_COLUMNS:-120}]]
        end
        return diff:gsub("diff ", "diff --color=always ", 1)
      end)(),
      ["--preview-window"] = "right:60%:border-left",
    },
    winopts = {
      title = " " .. prompt .. " ",
      title_pos = "center",
    },
    actions = {
      ["default"] = function(selected)
        local idx = selected and selected[1] and tonumber(selected[1]:match("^(%d+)\t"))
        if idx then
          M.open_file(idx)
        end
      end,
    },
  })
end

return M

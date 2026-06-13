local gh = require("pr-review.gh")
local ui = require("pr-review.ui")
local config = require("pr-review.config")

local M = {}

local ns = vim.api.nvim_create_namespace("pr-review")

local REACTIONS = { "+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes" }
local EMOJI = {
  ["+1"] = "👍",
  ["-1"] = "👎",
  laugh = "😄",
  confused = "😕",
  heart = "❤️",
  hooray = "🎉",
  rocket = "🚀",
  eyes = "👀",
}

local function notify(msg, lvl)
  vim.notify("pr-review: " .. msg, lvl or vim.log.levels.INFO)
end

local function st()
  return require("pr-review.pr").state
end

local function first_line(body)
  local line = vim.split(body or "", "\r?\n")[1] or ""
  if #line > 50 then
    line = line:sub(1, 50) .. "…"
  end
  return line
end

local function build_threads(raw)
  local by_id, threads = {}, {}
  for _, c in ipairs(raw) do
    if not c.in_reply_to_id then
      local t = { root = c, comments = { c } }
      by_id[c.id] = t
      table.insert(threads, t)
    end
  end
  for _, c in ipairs(raw) do
    if c.in_reply_to_id and by_id[c.in_reply_to_id] then
      table.insert(by_id[c.in_reply_to_id].comments, c)
    end
  end
  return threads
end

function M.refresh(cb)
  local state = st()
  if not state then
    notify("no active review session — run :Pr open", vim.log.levels.WARN)
    return
  end
  gh.api(("repos/{owner}/{repo}/pulls/%d/comments"):format(state.pr.number), { paginate = true }, function(ok, pages)
    if not ok then
      notify(tostring(pages), vim.log.levels.ERROR)
      return
    end
    state.threads = build_threads(gh.flatten(pages))
    M.decorate_all()
    if cb then
      cb()
    end
  end)
end

local function threads_for_buf(buf)
  local state = st()
  local path, side = vim.b[buf].pr_path, vim.b[buf].pr_side
  local out = {}
  if not (state and path) then
    return out
  end
  for _, t in ipairs(state.threads) do
    local r = t.root
    if r.path == path and (r.side or "RIGHT") == side and r.line then
      table.insert(out, t)
    end
  end
  return out
end

function M.decorate(buf)
  if not vim.api.nvim_buf_is_loaded(buf) then
    return
  end
  vim.api.nvim_buf_clear_namespace(buf, ns, 0, -1)
  local line_count = vim.api.nvim_buf_line_count(buf)
  for _, t in ipairs(threads_for_buf(buf)) do
    local r = t.root
    if r.line <= line_count then
      vim.api.nvim_buf_set_extmark(buf, ns, r.line - 1, 0, {
        sign_text = config.options.sign_text,
        sign_hl_group = "DiagnosticSignInfo",
        virt_text = {
          { ("  %s %d · @%s: %s"):format(config.options.sign_text, #t.comments, r.user.login, first_line(r.body)), "Comment" },
        },
        virt_text_pos = "eol",
      })
    end
  end
  for _, d in ipairs(M.pending_for_buf(buf)) do
    if d.line <= line_count then
      vim.api.nvim_buf_set_extmark(buf, ns, d.line - 1, 0, {
        sign_text = "▶",
        sign_hl_group = "DiagnosticSignWarn",
        virt_text = {
          { ("  ▶ pending: %s"):format(first_line(d.body)), "DiagnosticWarn" },
        },
        virt_text_pos = "eol",
      })
    end
  end
end

function M.decorate_all()
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(buf) and vim.b[buf].pr_path then
      M.decorate(buf)
    end
  end
end

function M.count_for_path(path)
  local state = st()
  local n = 0
  for _, t in ipairs(state and state.threads or {}) do
    if t.root.path == path then
      n = n + 1
    end
  end
  return n
end

function M.jump(dir)
  local lines = {}
  for _, t in ipairs(threads_for_buf(0)) do
    table.insert(lines, t.root.line)
  end
  table.sort(lines)
  local row = vim.fn.line(".")
  local target
  if dir > 0 then
    for _, l in ipairs(lines) do
      if l > row then
        target = l
        break
      end
    end
  else
    for i = #lines, 1, -1 do
      if lines[i] < row then
        target = lines[i]
        break
      end
    end
  end
  if target then
    vim.api.nvim_win_set_cursor(0, { target, 0 })
  else
    notify("no more comments in this buffer")
  end
end

function M.thread_at_cursor()
  local row = vim.fn.line(".")
  for _, t in ipairs(threads_for_buf(0)) do
    local r = t.root
    if row >= (r.start_line or r.line) and row <= r.line then
      return t
    end
  end
end

local function reshow(thread)
  local state = st()
  for _, t in ipairs(state and state.threads or {}) do
    if t.root.id == thread.root.id then
      M.show_thread(t)
      return
    end
  end
end

local function refresh_and_reshow(thread)
  return function(ok, res)
    if not ok then
      notify(tostring(res), vim.log.levels.ERROR)
      return
    end
    M.refresh(function()
      reshow(thread)
    end)
  end
end

function M.reply(thread)
  ui.compose({
    title = "Reply to @" .. thread.root.user.login,
    on_submit = function(text)
      gh.api(
        ("repos/{owner}/{repo}/pulls/%d/comments/%d/replies"):format(st().pr.number, thread.root.id),
        { method = "POST", body = { body = text } },
        refresh_and_reshow(thread)
      )
    end,
  })
end

function M.edit(comment, thread)
  ui.compose({
    title = "Edit comment",
    initial = comment.body,
    on_submit = function(text)
      gh.api(
        ("repos/{owner}/{repo}/pulls/comments/%d"):format(comment.id),
        { method = "PATCH", body = { body = text } },
        refresh_and_reshow(thread)
      )
    end,
  })
end

function M.react(comment, thread)
  vim.ui.select(REACTIONS, {
    prompt = "Toggle reaction",
    format_item = function(c)
      return EMOJI[c] .. "  " .. c
    end,
  }, function(content)
    if not content then
      reshow(thread)
      return
    end
    local endpoint = ("repos/{owner}/{repo}/pulls/comments/%d/reactions"):format(comment.id)
    gh.api(endpoint, { paginate = true }, function(ok, pages)
      if not ok then
        notify(tostring(pages), vim.log.levels.ERROR)
        return
      end
      local mine
      for _, r in ipairs(gh.flatten(pages)) do
        if r.content == content and r.user and r.user.login == st().viewer then
          mine = r
          break
        end
      end
      if mine then
        gh.api(endpoint .. "/" .. mine.id, { method = "DELETE" }, refresh_and_reshow(thread))
      else
        gh.api(endpoint, { method = "POST", body = { content = content } }, refresh_and_reshow(thread))
      end
    end)
  end)
end

function M.render_thread(thread, add)
  for i, c in ipairs(thread.comments) do
    if i > 1 then
      add("", c)
    end
    local edited = (c.updated_at and c.updated_at ~= c.created_at) and " (edited)" or ""
    add(("### @%s · %s%s"):format(c.user.login, (c.created_at or ""):sub(1, 10), edited), c)
    for _, l in ipairs(vim.split(c.body or "", "\r?\n")) do
      add(l, c)
    end
    local rx = {}
    for _, key in ipairs(REACTIONS) do
      local n = c.reactions and c.reactions[key]
      if n and n > 0 then
        table.insert(rx, EMOJI[key] .. " " .. n)
      end
    end
    if #rx > 0 then
      add("> " .. table.concat(rx, "  "), c)
    end
  end
end

function M.show_thread(thread)
  local lines, linemap = {}, {}
  M.render_thread(thread, function(line, c)
    table.insert(lines, line)
    linemap[#lines] = c
  end)

  local root = thread.root
  local buf, win, close = ui.float(lines, {
    title = ("%s:%s"):format(root.path, root.line or "outdated"),
    footer = "r reply · e edit · a react · o browser · q close",
  })

  local function comment_at_cursor()
    return linemap[vim.api.nvim_win_get_cursor(win)[1]] or thread.comments[#thread.comments]
  end
  vim.keymap.set("n", "r", function()
    close()
    M.reply(thread)
  end, { buffer = buf })
  vim.keymap.set("n", "e", function()
    local c = comment_at_cursor()
    if c.user.login ~= st().viewer then
      notify("you can only edit your own comments", vim.log.levels.WARN)
      return
    end
    close()
    M.edit(c, thread)
  end, { buffer = buf })
  vim.keymap.set("n", "a", function()
    local c = comment_at_cursor()
    close()
    M.react(c, thread)
  end, { buffer = buf })
  vim.keymap.set("n", "o", function()
    local c = comment_at_cursor()
    if c.html_url then
      vim.ui.open(c.html_url)
    end
  end, { buffer = buf })
end

function M.show_thread_at_cursor()
  local t = M.thread_at_cursor()
  if t then
    M.show_thread(t)
  else
    notify("no comment thread on this line")
  end
end

function M.pick_thread()
  local state = st()
  if not state then
    notify("no active review session — run :Pr open", vim.log.levels.WARN)
    return
  end
  if #state.threads == 0 then
    notify("no review comments yet")
    return
  end
  local dir = vim.fn.tempname()
  vim.fn.mkdir(dir, "p")
  local entries, by_entry = {}, {}
  for idx, t in ipairs(state.threads) do
    local r = t.root
    local loc = r.line and (":" .. r.line .. ((r.side or "RIGHT") == "LEFT" and " (base)" or "")) or " (outdated)"
    local lines = {}
    M.render_thread(t, function(line)
      lines[#lines + 1] = line
    end)
    local file = ("%s/%d"):format(dir, idx)
    vim.fn.writefile(lines, file)
    entries[#entries + 1] = ("%d\t%s\t%s%s  @%s: %s  ×%d"):format(idx, file, r.path, loc, r.user.login, first_line(r.body), #t.comments)
    by_entry[idx] = t
  end
  require("fzf-lua").fzf_exec(entries, {
    prompt = "Threads> ",
    fzf_opts = {
      ["--delimiter"] = "\\t",
      ["--with-nth"] = "3..",
      ["--nth"] = "3..",
      ["--preview"] = "cat {2}",
      ["--preview-window"] = "right:55%:border-left:wrap",
    },
    winopts = {
      title = " Review threads ",
      title_pos = "center",
    },
    actions = {
      ["default"] = function(selected)
        local t = selected and selected[1] and by_entry[tonumber(selected[1]:match("^(%d+)\t"))]
        if not t then
          return
        end
        if t.root.line then
          require("pr-review.review").open_location(t.root.path, t.root.side or "RIGHT", t.root.line)
        end
        M.show_thread(t)
      end,
    },
  })
end

function M.add_comment(l1, l2)
  local state = st()
  if not state then
    notify("no active review session — run :Pr open", vim.log.levels.WARN)
    return
  end
  local path, side = vim.b.pr_path, vim.b.pr_side
  if not path then
    notify("not a review buffer — open a file via :Pr files", vim.log.levels.WARN)
    return
  end
  l1 = l1 or vim.fn.line(".")
  l2 = l2 or l1
  if l1 > l2 then
    l1, l2 = l2, l1
  end
  local range = l1 ~= l2 and (("%d-%d"):format(l1, l2)) or tostring(l2)

  local function descriptor(text)
    local d = { body = text, path = path, line = l2, side = side }
    if l1 ~= l2 then
      d.start_line = l1
      d.start_side = side
    end
    return d
  end

  ui.compose({
    title = ("Comment on %s:%s"):format(path, range),
    footer = "<C-s> add to review · <C-a> comment now",
    on_submit = function(text)
      state.pending = state.pending or {}
      table.insert(state.pending, descriptor(text))
      notify(("added to review (%d pending) — submit with :Pr submit"):format(#state.pending))
      M.decorate_all()
    end,
    on_submit_alt = function(text)
      local body = descriptor(text)
      body.commit_id = state.pr.headRefOid
      body.start_side = body.start_line and side or nil
      gh.api(("repos/{owner}/{repo}/pulls/%d/comments"):format(state.pr.number), { method = "POST", body = body }, function(ok, res)
        if not ok then
          notify(tostring(res), vim.log.levels.ERROR)
          return
        end
        notify("comment posted")
        M.refresh()
      end)
    end,
  })
end

function M.pending_for_buf(buf)
  local state = st()
  local path, side = vim.b[buf].pr_path, vim.b[buf].pr_side
  local out = {}
  for _, d in ipairs(state and state.pending or {}) do
    if d.path == path and d.side == side then
      out[#out + 1] = d
    end
  end
  return out
end

return M

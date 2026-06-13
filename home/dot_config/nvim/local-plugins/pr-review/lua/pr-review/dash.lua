local gh = require("pr-review.gh")
local config = require("pr-review.config")

local M = {}

local FIELDS = table.concat({
  "number", "title", "body", "url", "author", "updatedAt", "isDraft",
  "reviewDecision", "additions", "deletions", "headRefName", "baseRefName",
  "state", "labels", "mergeable", "mergeStateStatus",
  "comments", "latestReviews", "reviewRequests", "statusCheckRollup",
  "files", "commits", "createdAt",
}, ",")

local DECISION = {
  APPROVED = { "✓", "DiagnosticOk" },
  CHANGES_REQUESTED = { "✗", "DiagnosticError" },
  REVIEW_REQUIRED = { "●", "DiagnosticWarn" },
}
local NO_DECISION = { "·", "Comment" }
local DRAFT = { "◌", "Comment" }

local REVIEW_ICON = {
  APPROVED = "✓",
  CHANGES_REQUESTED = "✗",
  COMMENTED = "󰭹",
  DISMISSED = "·",
}

local REVIEW_HL = {
  APPROVED = { "✓", "DiagnosticOk" },
  CHANGES_REQUESTED = { "✗", "DiagnosticError" },
  COMMENTED = { "󰭹", "Comment" },
  DISMISSED = { "·", "Comment" },
}

local function hl_attr(name, attr)
  local ok, h = pcall(vim.api.nvim_get_hl, 0, { name = name, link = false })
  if ok and h[attr] then
    return ("#%06x"):format(h[attr])
  end
end

local function rel_time(iso)
  local y, mo, d, h, mi, s = (iso or ""):match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then
    return ""
  end
  local then_utc = os.time({
    year = tonumber(y),
    month = tonumber(mo),
    day = tonumber(d),
    hour = tonumber(h),
    min = tonumber(mi),
    sec = tonumber(s),
  })
  local diff = math.max(0, os.time(os.date("!*t")) - then_utc)
  if diff < 3600 then
    return math.floor(diff / 60) .. "m"
  elseif diff < 86400 then
    return math.floor(diff / 3600) .. "h"
  end
  return math.floor(diff / 86400) .. "d"
end

local function fit(s, w)
  if vim.fn.strdisplaywidth(s) > w then
    while vim.fn.strdisplaywidth(s) > math.max(0, w - 1) do
      s = vim.fn.strcharpart(s, 0, vim.fn.strchars(s) - 1)
    end
    s = s .. "…"
  end
  return s .. string.rep(" ", math.max(0, w - vim.fn.strdisplaywidth(s)))
end

local function checks_summary(rollup)
  local s = { success = 0, failing = 0, pending = 0, skipped = 0, total = 0 }
  for _, c in ipairs(rollup or {}) do
    s.total = s.total + 1
    local r = c.conclusion
    if r == nil or r == "" then
      if c.state then
        r = c.state
      elseif c.status == "COMPLETED" then
        r = "SUCCESS"
      else
        r = "PENDING"
      end
    end
    if r == "SUCCESS" or r == "NEUTRAL" then
      s.success = s.success + 1
    elseif r == "FAILURE" or r == "ERROR" or r == "TIMED_OUT" or r == "CANCELLED" or r == "ACTION_REQUIRED" then
      s.failing = s.failing + 1
    elseif r == "SKIPPED" then
      s.skipped = s.skipped + 1
    else
      s.pending = s.pending + 1
    end
  end
  return s
end

local function ci_badge(rollup)
  local s = checks_summary(rollup)
  if s.total == 0 then
    return { " ", "Comment" }
  elseif s.failing > 0 then
    return { "✗", "DiagnosticError" }
  elseif s.pending > 0 then
    return { "●", "DiagnosticWarn" }
  end
  return { "✓", "DiagnosticOk" }
end

local function fetch_one(section, cb)
  local opts = config.options.dash
  local args = { "pr", "list", "--limit", tostring(opts.limit), "--json", FIELDS }
  if section.search and section.search ~= "" then
    vim.list_extend(args, { "--search", section.search })
  end
  gh.run(args, {}, function(ok, prs)
    if not ok then
      vim.notify("pr-review: " .. tostring(prs), vim.log.levels.WARN)
    end
    cb(ok and prs or {})
  end)
end

local function fetch(cb)
  local opts = config.options.dash
  local results, pending = {}, #opts.sections
  for i, section in ipairs(opts.sections) do
    fetch_one(section, function(prs)
      results[i] = prs
      pending = pending - 1
      if pending == 0 then
        cb(results)
      end
    end)
  end
end

function M.show()
  vim.notify("pr-review: loading PRs…")
  fetch(function(results)
    M.s = {
      sections = {},
      active = 1,
    }
    for i, section in ipairs(config.options.dash.sections) do
      table.insert(M.s.sections, { title = vim.trim(section.title), search = section.search or "", prs = results[i] or {} })
    end
    for _, sec in ipairs(M.s.sections) do
      for _, p in ipairs(sec.prs) do
        local o, r = (p.url or ""):match("github%.com/([^/]+)/([^/]+)/")
        if o then
          M.s.repo = o .. "/" .. r
          break
        end
      end
      if M.s.repo then
        break
      end
    end
    M.open_layout()
  end)
end

local NS = vim.api.nvim_create_namespace("pr-review-dash")

local function render_list()
  local s = M.s
  local lines, hls, prmap = {}, {}, {}
  local function add(line)
    lines[#lines + 1] = line
    return #lines - 1
  end

  local tab = {}
  for _, sec in ipairs(s.sections) do
    tab[#tab + 1] = sec.loading and ("%s (⟳)"):format(sec.title) or ("%s (%d)"):format(sec.title, #sec.prs)
  end
  add("  " .. table.concat(tab, "   │   "))
  do
    local col = 2
    for i, label in ipairs(tab) do
      hls[#hls + 1] = { 0, col, col + #label, i == s.active and "Title" or "Comment" }
      col = col + #label + #"   │   "
    end
  end

  local active = s.sections[s.active]
  add("")

  local prs = active.prs
  local width = vim.api.nvim_win_get_width(s.list_win)

  if #prs == 0 then
    hls[#hls + 1] = { add(active.loading and "    ⟳ loading…" or "    none"), 0, -1, "Comment" }
  end
  for _, p in ipairs(prs) do
    local badge = p.isDraft and DRAFT or (DECISION[p.reviewDecision or ""] or NO_DECISION)
    local ci = ci_badge(p.statusCheckRollup)
    local ncomments = #(p.comments or {})
    local meta = ("%5s  %s  +%d -%d  %s"):format(
      ncomments > 0 and ("󰍢 " .. ncomments) or "",
      ci[1],
      p.additions or 0,
      p.deletions or 0,
      rel_time(p.updatedAt)
    )
    local head = ("  %s @%s"):format(badge[1], p.author.login)
    local pad = width - vim.fn.strdisplaywidth(head) - vim.fn.strdisplaywidth(meta) - 2
    local line1 = head .. string.rep(" ", math.max(1, pad)) .. meta
    local r1 = add(line1)
    prmap[r1 + 1] = p
    hls[#hls + 1] = { r1, 2, 2 + #badge[1], badge[2] }
    hls[#hls + 1] = { r1, 2 + #badge[1] + 1, #head, "Comment" }
    local mstart = #line1 - #meta
    hls[#hls + 1] = { r1, mstart, #line1, "Comment" }
    local adds, dels = "+" .. (p.additions or 0), "-" .. (p.deletions or 0)
    local ai = meta:find(adds, 1, true)
    if ai then
      hls[#hls + 1] = { r1, mstart + ai - 1, mstart + ai - 1 + #adds, "Added" }
    end
    local di = meta:find(dels, ai and (ai + #adds) or 1, true)
    if di then
      hls[#hls + 1] = { r1, mstart + di - 1, mstart + di - 1 + #dels, "Removed" }
    end

    local r2 = add("      " .. fit(p.title, width - 8))
    prmap[r2 + 1] = p
    hls[#hls + 1] = { r2, 0, -1, p.isDraft and "Comment" or "Normal" }
  end

  vim.bo[s.list_buf].modifiable = true
  vim.api.nvim_buf_set_lines(s.list_buf, 0, -1, false, lines)
  vim.bo[s.list_buf].modifiable = false
  vim.api.nvim_buf_clear_namespace(s.list_buf, NS, 0, -1)
  for _, h in ipairs(hls) do
    local end_col = h[3] == -1 and #lines[h[1] + 1] or h[3]
    pcall(vim.api.nvim_buf_set_extmark, s.list_buf, NS, h[1], h[2], { end_col = end_col, hl_group = h[4] })
  end

  s.prmap = prmap
  for l = 1, #lines do
    if prmap[l] then
      vim.api.nvim_win_set_cursor(s.list_win, { l, 0 })
      break
    end
  end
end

local function pr_at_cursor()
  local s = M.s
  return s.prmap[vim.api.nvim_win_get_cursor(s.list_win)[1]]
end

local PREV_NS = vim.api.nvim_create_namespace("pr-review-dash-preview-hl")
local SUBTABS = { "Overview", "Activity", "Commits", "Checks" }

local function preview_lines(p, width)
  local out, hls = {}, {}
  local function add(line)
    out[#out + 1] = line
    return #out - 1
  end
  local function hl(row, from, to, group)
    hls[#hls + 1] = { row, from, to, group }
  end

  local owner, repo = (p.url or ""):match("github%.com/([^/]+)/([^/]+)/")
  hl(add(("%s/%s · #%d"):format(owner or "?", repo or "?", p.number)), 0, -1, "Comment")
  add("")
  hl(add(p.title), 0, -1, "Title")
  add("")

  do
    local text, group
    if p.isDraft then
      text, group = "Draft", "Comment"
    elseif p.state == "MERGED" then
      text, group = "Merged", "Keyword"
    elseif p.state == "CLOSED" then
      text, group = "Closed", "DiagnosticError"
    else
      text, group = "Open", "Function"
    end
    local color = hl_attr(group, "fg") or "#89b4fa"
    local base = hl_attr("Normal", "bg") or "#1e1e2e"
    vim.api.nvim_set_hl(0, "PrReviewBadge", { fg = base, bg = color, bold = true })
    vim.api.nvim_set_hl(0, "PrReviewBadgeEdge", { fg = color })
    local L, R = "\u{e0b6}", "\u{e0b4}"
    local label = " " .. text .. " "
    local r = add(L .. label .. R .. "  " .. p.baseRefName .. " ← " .. p.headRefName)
    hl(r, 0, #L, "PrReviewBadgeEdge")
    hl(r, #L, #L + #label, "PrReviewBadge")
    hl(r, #L + #label, #L + #label + #R, "PrReviewBadgeEdge")
    hl(r, #L + #label + #R, -1, "Comment")
  end
  hl(add(("by @%s · %s ago"):format(p.author.login, rel_time(p.createdAt or p.updatedAt))), 0, -1, "Comment")
  add("")

  do
    local parts = {}
    for _, t in ipairs(SUBTABS) do
      parts[#parts + 1] = " " .. t .. " "
    end
    local r2 = add(table.concat(parts, " "))
    hl(r2, 0, #parts[1], "Title")
    hl(r2, #parts[1], -1, "Comment")
  end
  add("")

  local reviewers, seen = {}, {}
  for _, rv in ipairs(p.latestReviews or {}) do
    local login = rv.author and rv.author.login
    if login and not seen[login] then
      seen[login] = true
      local ic = REVIEW_HL[rv.state] or { "·", "Comment" }
      reviewers[#reviewers + 1] = { ic[1], ic[2], login = login }
    end
  end
  for _, rq in ipairs(p.reviewRequests or {}) do
    local login = rq.login or rq.name
    if login and not seen[login] then
      seen[login] = true
      reviewers[#reviewers + 1] = { "●", "DiagnosticWarn", login = login }
    end
  end
  if #reviewers > 0 then
    hl(add("≡ Reviewers"), 0, -1, "Title")
    local line = ""
    local marks = {}
    for i, rv in ipairs(reviewers) do
      if i > 1 then
        line = line .. ", "
      end
      marks[#marks + 1] = { #line, #line + #rv[1], rv[2] }
      line = line .. rv[1] .. " @" .. rv.login
    end
    local row = add(line)
    for _, m in ipairs(marks) do
      hl(row, m[1], m[2], m[3])
    end
    add("")
  end

  hl(add("▤ Changes"), 0, -1, "Title")
  do
    local pre = ("  %d files changed "):format(#(p.files or {}))
    local adds = "+" .. (p.additions or 0)
    local dels = "-" .. (p.deletions or 0)
    local rowc = add(pre .. adds .. " " .. dels)
    hl(rowc, 0, #pre, "Comment")
    hl(rowc, #pre, #pre + #adds, "Added")
    hl(rowc, #pre + #adds + 1, #pre + #adds + 1 + #dels, "Removed")
  end
  do
    local last = p.commits and p.commits[#p.commits]
    local age = last and (" " .. rel_time(last.committedDate) .. " ago") or ""
    hl(add(("  %d commits%s"):format(#(p.commits or {}), age)), 0, -1, "Comment")
  end
  add("")

  hl(add("▣ Checks"), 0, -1, "Title")
  do
    local cs = checks_summary(p.statusCheckRollup)
    local blocked = p.mergeStateStatus == "BLOCKED" or p.mergeStateStatus == "DIRTY" or p.mergeStateStatus == "BEHIND"
    local border_hl = (cs.failing > 0 or blocked) and "DiagnosticError"
      or (cs.pending > 0 and "DiagnosticWarn" or "DiagnosticOk")
    local inner = math.max(34, math.min((width or 60) - 4, 56))

    local function box(line, mark_hl, mark_len)
      local content = fit(line, inner)
      local row = add("│ " .. content .. " │")
      local last_byte = #out[row + 1]
      hl(row, 0, 3, border_hl)
      hl(row, last_byte - 3, last_byte, border_hl)
      if mark_hl then
        hl(row, 4, 4 + (mark_len or 3), mark_hl)
      end
      return row
    end
    hl(add("╭" .. string.rep("─", inner + 2) .. "╮"), 0, -1, border_hl)

    local approvals = 0
    for _, rv in ipairs(p.latestReviews or {}) do
      if rv.state == "APPROVED" then
        approvals = approvals + 1
      end
    end
    if p.reviewDecision == "APPROVED" then
      box("✓ Changes approved", "DiagnosticOk")
      box(("  %d approving review%s"):format(approvals, approvals == 1 and "" or "s"))
    elseif p.reviewDecision == "CHANGES_REQUESTED" then
      box("✗ Changes requested", "DiagnosticError")
    else
      box("● Review required", "DiagnosticWarn")
    end

    if cs.total > 0 then
      box("")
      if cs.failing > 0 or cs.pending > 0 then
        box("✗ Some checks were not successful", "DiagnosticError")
      else
        box("✓ All checks have passed", "DiagnosticOk")
      end
      local parts = {}
      if cs.failing > 0 then
        parts[#parts + 1] = cs.failing .. " failing"
      end
      if cs.pending > 0 then
        parts[#parts + 1] = cs.pending .. " in progress"
      end
      if cs.skipped > 0 then
        parts[#parts + 1] = cs.skipped .. " skipped"
      end
      parts[#parts + 1] = cs.success .. " successful"
      box("  " .. table.concat(parts, ", "))

      local barw = inner - 2
      local segs = {
        { cs.failing, "DiagnosticError" },
        { cs.pending, "DiagnosticWarn" },
        { cs.skipped, "Comment" },
        { cs.success, "DiagnosticOk" },
      }
      local bar, segmarks, used = "", {}, 0
      for i, seg in ipairs(segs) do
        local w
        if i == #segs then
          w = barw - used
        else
          w = math.floor(barw * seg[1] / cs.total + 0.5)
        end
        w = math.max(0, math.min(w, barw - used))
        if w > 0 then
          local chunk = string.rep("█", w)
          segmarks[#segmarks + 1] = { #bar, #bar + #chunk, seg[2] }
          bar = bar .. chunk
          used = used + w
        end
      end
      local brow = box("  " .. bar)
      for _, sm in ipairs(segmarks) do
        hl(brow, 4 + 2 + sm[1], 4 + 2 + sm[2], sm[3])
      end
    end

    if blocked then
      box("")
      box("✗ Merging is blocked" .. (p.mergeStateStatus == "DIRTY" and " (conflicts)" or ""), "DiagnosticError")
    elseif p.mergeStateStatus == "CLEAN" or p.mergeStateStatus == "HAS_HOOKS" then
      box("")
      box("✓ Ready to merge", "DiagnosticOk")
    end
    hl(add("╰" .. string.rep("─", inner + 2) .. "╯"), 0, -1, border_hl)
  end
  add("")

  hl(add("≡ Summary"), 0, -1, "Title")
  for _, l in ipairs(vim.split(p.body or "", "\r?\n")) do
    add(l)
  end

  return out, hls
end

local function update_preview()
  local s = M.s
  local p = pr_at_cursor()
  if not (s.prev_buf and vim.api.nvim_buf_is_valid(s.prev_buf)) then
    return
  end
  local lines, hls = { "" }, {}
  if p then
    lines, hls = preview_lines(p, vim.api.nvim_win_get_width(s.prev_win))
  end
  vim.bo[s.prev_buf].modifiable = true
  vim.api.nvim_buf_set_lines(s.prev_buf, 0, -1, false, lines)
  vim.bo[s.prev_buf].modifiable = false
  vim.api.nvim_buf_clear_namespace(s.prev_buf, PREV_NS, 0, -1)
  for _, h in ipairs(hls) do
    local end_col = h[3] == -1 and #lines[h[1] + 1] or h[3]
    pcall(vim.api.nvim_buf_set_extmark, s.prev_buf, PREV_NS, h[1], h[2], { end_col = end_col, hl_group = h[4] })
  end
  if p then
    pcall(vim.api.nvim_win_set_cursor, s.prev_win, { 1, 0 })
  end
end

function M.switch_tab(delta)
  local s = M.s
  s.active = ((s.active - 1 + delta) % #s.sections) + 1
  render_list()
  update_preview()
end

function M.refresh()
  local s = M.s
  if not (s and s.list_buf and vim.api.nvim_buf_is_valid(s.list_buf)) then
    return
  end
  local secs = config.options.dash.sections
  s.sections = s.sections or {}
  for i, section in ipairs(secs) do
    local prev = s.sections[i]
    s.sections[i] = {
      title = vim.trim(section.title),
      search = section.search or "",
      prs = (prev and prev.prs) or {},
      loading = true,
    }
  end
  for j = #s.sections, #secs + 1, -1 do
    s.sections[j] = nil
  end
  s.active = math.min(s.active or 1, #s.sections)
  render_list()
  update_preview()
  vim.cmd("redraw")
  for i, section in ipairs(secs) do
    fetch_one(section, function(prs)
      if not (vim.api.nvim_buf_is_valid(s.list_buf) and s.sections[i]) then
        return
      end
      s.sections[i] = { title = vim.trim(section.title), search = section.search or "", prs = prs, loading = false }
      render_list()
      update_preview()
    end)
  end
end

function M.open_layout()
  local s = M.s
  vim.cmd("tabnew")
  s.tab = vim.api.nvim_get_current_tabpage()
  s.list_win = vim.api.nvim_get_current_win()
  s.list_buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_win_set_buf(s.list_win, s.list_buf)
  vim.bo[s.list_buf].buftype = "nofile"
  vim.bo[s.list_buf].bufhidden = "wipe"
  vim.bo[s.list_buf].filetype = "pr-review-dash"
  vim.wo[s.list_win].number = false
  vim.wo[s.list_win].relativenumber = false
  vim.wo[s.list_win].cursorline = true
  vim.wo[s.list_win].wrap = false
  vim.wo[s.list_win].list = false
  vim.wo[s.list_win].colorcolumn = ""
  vim.wo[s.list_win].signcolumn = "no"
  vim.wo[s.list_win].foldcolumn = "0"

  vim.cmd("rightbelow vertical split")
  s.prev_win = vim.api.nvim_get_current_win()
  s.prev_buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_win_set_buf(s.prev_win, s.prev_buf)
  vim.bo[s.prev_buf].buftype = "nofile"
  vim.bo[s.prev_buf].bufhidden = "wipe"
  vim.bo[s.prev_buf].filetype = "markdown"
  vim.wo[s.prev_win].wrap = true
  vim.wo[s.prev_win].number = false
  vim.wo[s.prev_win].relativenumber = false
  vim.wo[s.prev_win].list = false
  vim.wo[s.prev_win].colorcolumn = ""
  vim.wo[s.prev_win].signcolumn = "no"
  vim.wo[s.prev_win].foldcolumn = "0"
  pcall(vim.api.nvim_win_set_width, s.list_win, math.floor(vim.o.columns * 0.55))
  vim.api.nvim_set_current_win(s.list_win)

  render_list()

  local grp = vim.api.nvim_create_augroup("pr-review-dash-preview", { clear = true })
  vim.api.nvim_create_autocmd("CursorMoved", {
    group = grp,
    buffer = s.list_buf,
    callback = update_preview,
  })

  local function close()
    if vim.api.nvim_tabpage_is_valid(s.tab) then
      vim.api.nvim_set_current_tabpage(s.tab)
      vim.cmd("tabclose")
    end
  end
  local function map(lhs, fn)
    vim.keymap.set("n", lhs, fn, { buffer = s.list_buf, nowait = true })
  end
  map("<Tab>", function()
    M.switch_tab(1)
  end)
  map("<S-Tab>", function()
    M.switch_tab(-1)
  end)
  map("L", function()
    M.switch_tab(1)
  end)
  map("H", function()
    M.switch_tab(-1)
  end)
  map("<CR>", function()
    local p = pr_at_cursor()
    if p then
      close()
      require("pr-review.pr").open(p.number)
    end
  end)
  map("o", function()
    local p = pr_at_cursor()
    if p and p.url then
      vim.ui.open(p.url)
    end
  end)
  map("r", M.refresh)
  map("q", close)

  update_preview()
end

return M

local gh = require("pr-review.gh")

local M = { state = nil }

local function notify(msg, lvl)
  vim.notify("pr-review: " .. msg, lvl or vim.log.levels.INFO)
end

local PR_FIELDS = "id,number,title,url,state,isDraft,headRefName,baseRefName,headRefOid"

function M.open(number)
  local args = { "pr", "view" }
  if number then
    table.insert(args, tostring(number))
  end
  vim.list_extend(args, { "--json", PR_FIELDS })
  gh.run(args, {}, function(ok, pr)
    if not ok then
      if number then
        notify(tostring(pr), vim.log.levels.ERROR)
      else
        require("pr-review.dash").show()
      end
      return
    end
    M.start(pr)
  end)
end

local function git(args)
  local out = vim.fn.systemlist(vim.list_extend({ "git" }, args))
  if vim.v.shell_error ~= 0 then
    return nil
  end
  return out
end

local function find_merge_base(base_ref)
  for _, ref in ipairs({ "origin/" .. base_ref, base_ref }) do
    local out = git({ "merge-base", "HEAD", ref })
    if out and out[1] and out[1] ~= "" then
      return vim.trim(out[1])
    end
  end
end

local function update_head_ok()
  local st = M.state
  local head = git({ "rev-parse", "HEAD" })
  st.head_ok = (head and vim.trim(head[1]) == st.pr.headRefOid) or false
end

function M.checkout()
  local st = M.state
  if not st then
    return
  end
  gh.run({ "pr", "checkout", tostring(st.pr.number) }, {}, function(ok, out)
    if not ok then
      notify(tostring(out), vim.log.levels.ERROR)
      return
    end
    st.merge_base = find_merge_base(st.pr.baseRefName)
    update_head_ok()
    st.workdir = st.root
    vim.cmd("checktime")
    notify("checked out " .. st.pr.headRefName)
    if st.current then
      require("pr-review.review").open_file(st.current)
    end
  end)
end

local function ensure_head_oid()
  local st = M.state
  if git({ "cat-file", "-e", st.pr.headRefOid .. "^{commit}" }) then
    return true
  end
  notify("fetching PR head…")
  vim.fn.system({ "git", "fetch", "origin", ("pull/%d/head"):format(st.pr.number) })
  return git({ "cat-file", "-e", st.pr.headRefOid .. "^{commit}" }) ~= nil
end

local function ensure_worktree()
  local st = M.state
  if not ensure_head_oid() then
    notify("PR head commit not found even after fetch", vim.log.levels.ERROR)
    return nil
  end
  local target = ("%s/pr-review/%s-%s"):format(
    vim.fn.stdpath("cache"),
    vim.fn.fnamemodify(st.root, ":t"),
    vim.fn.sha256(st.root):sub(1, 8)
  )
  if vim.uv.fs_stat(target .. "/.git") then
    if not git({ "-C", target, "checkout", "--force", "--detach", st.pr.headRefOid }) then
      notify("failed to update review worktree at " .. target, vim.log.levels.ERROR)
      return nil
    end
    return target
  end
  vim.fn.mkdir(vim.fn.fnamemodify(target, ":h"), "p")
  vim.fn.system({ "git", "worktree", "prune" })
  local out = vim.fn.system({ "git", "worktree", "add", "--force", "--detach", target, st.pr.headRefOid })
  if vim.v.shell_error ~= 0 then
    notify("git worktree add failed: " .. vim.trim(out), vim.log.levels.ERROR)
    return nil
  end
  return target
end

function M.prepare_workdir(cb)
  local st = M.state
  update_head_ok()
  if st.head_ok then
    st.workdir = st.root
    cb()
    return
  end
  gh.run({ "pr", "checkout", tostring(st.pr.number) }, {}, function(ok, out)
    if ok then
      st.merge_base = find_merge_base(st.pr.baseRefName)
      update_head_ok()
      st.workdir = st.root
      vim.cmd("checktime")
      notify("checked out " .. st.pr.headRefName)
    else
      notify(
        "gh pr checkout failed: " .. vim.trim(tostring(out)) .. " — reviewing in a detached worktree instead",
        vim.log.levels.WARN
      )
      st.workdir = ensure_worktree() or st.root
    end
    cb()
  end)
end

function M.start(pr)
  gh.run({ "api", "user", "-q", ".login" }, { raw = true }, function(_, viewer)
    gh.api(("repos/{owner}/{repo}/pulls/%d/files"):format(pr.number), { paginate = true }, function(ok, pages)
      if not ok then
        notify(tostring(pages), vim.log.levels.ERROR)
        return
      end
      M.state = {
        pr = pr,
        files = gh.flatten(pages),
        threads = {},
        viewer = vim.trim(tostring(viewer or "")),
        merge_base = find_merge_base(pr.baseRefName),
        root = vim.trim((git({ "rev-parse", "--show-toplevel" }) or { "" })[1]),
        ready = false,
        on_ready = {},
      }
      notify(("#%d %s — %d files changed"):format(pr.number, pr.title, #M.state.files))
      require("pr-review.review").pick_file()
      M.fetch_viewed(function()
        M.prepare_workdir(function()
          local st = M.state
          st.ready = true
          local queued = st.on_ready
          st.on_ready = {}
          for _, cb in ipairs(queued) do
            cb()
          end
          require("pr-review.comments").refresh()
        end)
      end)
    end)
  end)
end

function M.refresh()
  local st = M.state
  if not st then
    notify("no active review session — run :Pr open", vim.log.levels.WARN)
    return
  end
  notify(("refreshing #%d…"):format(st.pr.number))
  gh.run({ "pr", "view", tostring(st.pr.number), "--json", PR_FIELDS }, {}, function(ok, pr)
    if not ok then
      notify(tostring(pr), vim.log.levels.ERROR)
      return
    end
    st.pr = pr
    st.merge_base = find_merge_base(pr.baseRefName)
    gh.api(("repos/{owner}/{repo}/pulls/%d/files"):format(pr.number), { paginate = true }, function(fok, pages)
      if not fok then
        notify(tostring(pages), vim.log.levels.ERROR)
        return
      end
      st.files = gh.flatten(pages)
      M.fetch_viewed(function()
        M.prepare_workdir(function()
          require("pr-review.comments").refresh(function()
            if st.current and st.files[st.current] then
              require("pr-review.review").open_file(st.current)
            end
            notify(("refreshed #%d — %d files, %d threads"):format(pr.number, #st.files, #st.threads))
          end)
        end)
      end)
    end)
  end)
end

local VIEWED_QUERY = [[
query($owner:String!, $repo:String!, $number:Int!, $cursor:String) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      files(first:100, after:$cursor) {
        nodes { path viewerViewedState }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}]]

function M.fetch_viewed(cb)
  local st = M.state
  st.viewed = {}
  local owner, repo = st.pr.url:match("github%.com/([^/]+)/([^/]+)/")
  if not owner then
    cb()
    return
  end
  local function page(cursor)
    local vars = { owner = owner, repo = repo, number = st.pr.number }
    if cursor then
      vars.cursor = cursor
    end
    gh.graphql(VIEWED_QUERY, vars, function(ok, res)
      if not ok or type(res) ~= "table" then
        cb()
        return
      end
      local files = res.data.repository.pullRequest.files
      for _, n in ipairs(files.nodes or {}) do
        st.viewed[n.path] = n.viewerViewedState == "VIEWED"
      end
      if files.pageInfo.hasNextPage then
        page(files.pageInfo.endCursor)
      else
        cb()
      end
    end)
  end
  page(nil)
end

function M.when_ready(cb)
  local st = M.state
  if not st then
    return
  end
  if st.ready then
    cb()
  else
    table.insert(st.on_ready, cb)
  end
end

function M.is_viewed(path)
  local st = M.state
  return st and st.viewed and st.viewed[path] == true
end

function M.set_viewed(path, viewed, cb)
  local st = M.state
  if not st then
    return
  end
  local mutation = viewed and "markFileAsViewed" or "unmarkFileAsViewed"
  local query = ([[
mutation($id:ID!, $path:String!) {
  %s(input:{pullRequestId:$id, path:$path}) { clientMutationId }
}]]):format(mutation)
  gh.graphql(query, { id = st.pr.id, path = path }, function(ok, res)
    if not ok then
      notify(tostring(res), vim.log.levels.ERROR)
      return
    end
    st.viewed[path] = viewed
    if cb then
      cb()
    end
  end)
end

function M.toggle_viewed(path)
  local now = M.is_viewed(path)
  M.set_viewed(path, not now, function()
    notify((now and "unmarked " or "marked viewed: ") .. path)
    require("pr-review.comments").decorate_all()
  end)
end

function M.viewed_count()
  local st = M.state
  local n = 0
  for _, f in ipairs(st and st.files or {}) do
    if M.is_viewed(f.filename) then
      n = n + 1
    end
  end
  return n
end

function M.base_content(file)
  local st = M.state
  if not st or file.status == "added" then
    return {}
  end
  local path = file.previous_filename or file.filename
  local function show()
    local ref = st.merge_base or ("origin/" .. st.pr.baseRefName)
    return git({ "show", ref .. ":" .. path })
  end
  local lines = show()
  if not lines and not st.fetched_base then
    st.fetched_base = true
    notify("fetching origin/" .. st.pr.baseRefName .. "…")
    vim.fn.system({ "git", "fetch", "origin", st.pr.baseRefName })
    st.merge_base = find_merge_base(st.pr.baseRefName)
    lines = show()
  end
  return lines or {}
end

function M.submit()
  local st = M.state
  if not st then
    notify("no active review session — run :Pr open", vim.log.levels.WARN)
    return
  end
  local pending = st.pending or {}
  local labels = { APPROVE = "Approve", REQUEST_CHANGES = "Request changes", COMMENT = "Comment" }
  vim.ui.select({ "APPROVE", "REQUEST_CHANGES", "COMMENT" }, {
    prompt = ("Submit review for #%d (%d pending comment%s) as"):format(
      st.pr.number,
      #pending,
      #pending == 1 and "" or "s"
    ),
    format_item = function(ev)
      return labels[ev]
    end,
  }, function(ev)
    if not ev then
      return
    end
    require("pr-review.ui").compose({
      title = labels[ev] .. " — summary" .. (ev == "COMMENT" and "" or " (optional)"),
      allow_empty = ev ~= "COMMENT",
      footer = "<C-s> submit",
      on_submit = function(text)
        local body = { event = ev, commit_id = st.pr.headRefOid }
        if text ~= "" then
          body.body = text
        end
        if #pending > 0 then
          body.comments = pending
        end
        gh.api(("repos/{owner}/{repo}/pulls/%d/reviews"):format(st.pr.number), { method = "POST", body = body }, function(ok, res)
          if not ok then
            notify(tostring(res), vim.log.levels.ERROR)
            return
          end
          st.pending = {}
          notify(("review submitted: %s (%d comment%s)"):format(labels[ev], #pending, #pending == 1 and "" or "s"))
          require("pr-review.comments").refresh()
        end)
      end,
    })
  end)
end

function M.discard_pending()
  local st = M.state
  if not st or not st.pending or #st.pending == 0 then
    notify("no pending comments")
    return
  end
  local n = #st.pending
  st.pending = {}
  require("pr-review.comments").decorate_all()
  notify(("discarded %d pending comment%s"):format(n, n == 1 and "" or "s"))
end

function M.merge()
  local st = M.state
  if not st then
    notify("no active review session — run :Pr open", vim.log.levels.WARN)
    return
  end
  vim.ui.select({ "squash", "merge", "rebase" }, {
    prompt = ("Merge #%d via"):format(st.pr.number),
  }, function(method)
    if not method then
      return
    end
    vim.ui.select({ "Yes", "Yes, and delete branch", "No" }, {
      prompt = ("%s-merge #%d?"):format(method, st.pr.number),
    }, function(choice)
      if not choice or choice == "No" then
        return
      end
      local args = { "pr", "merge", tostring(st.pr.number), "--" .. method }
      if choice == "Yes, and delete branch" then
        table.insert(args, "--delete-branch")
      end
      notify(("merging #%d (%s)…"):format(st.pr.number, method))
      gh.run(args, {}, function(ok, out)
        if not ok then
          notify(tostring(out), vim.log.levels.ERROR)
          return
        end
        notify(("merged #%d"):format(st.pr.number))
      end)
    end)
  end)
end

function M.automerge()
  local st = M.state
  if not st then
    notify("no active review session — run :Pr open", vim.log.levels.WARN)
    return
  end
  vim.ui.select({ "Enable (squash)", "Enable (merge)", "Enable (rebase)", "Disable" }, {
    prompt = ("Auto-merge for #%d"):format(st.pr.number),
  }, function(choice)
    if not choice then
      return
    end
    local args = { "pr", "merge", tostring(st.pr.number) }
    if choice == "Disable" then
      table.insert(args, "--disable-auto")
    else
      vim.list_extend(args, { "--auto", "--" .. choice:match("%((%a+)%)") })
    end
    gh.run(args, {}, function(ok, out)
      if not ok then
        notify(tostring(out), vim.log.levels.ERROR)
        return
      end
      notify(("auto-merge %s for #%d"):format(choice == "Disable" and "disabled" or "enabled", st.pr.number))
    end)
  end)
end

function M.status()
  local st = M.state
  if not st then
    notify("no active review session")
    return
  end
  notify(("#%d %s [%s]\n%s ← %s · %d files · %d threads · %d pending"):format(
    st.pr.number,
    st.pr.title,
    st.pr.state,
    st.pr.baseRefName,
    st.pr.headRefName,
    #st.files,
    #st.threads,
    #(st.pending or {})
  ))
end

function M.close()
  local st = M.state
  if st and st.tabpage and vim.api.nvim_tabpage_is_valid(st.tabpage) and #vim.api.nvim_list_tabpages() > 1 then
    vim.api.nvim_set_current_tabpage(st.tabpage)
    vim.cmd("tabclose")
  end
  M.state = nil
  notify("review session closed")
end

return M

local M = {}

function M.run(args, opts, cb)
  opts = opts or {}
  local cmd = vim.list_extend({ "gh" }, args)
  vim.system(cmd, { text = true, stdin = opts.stdin, timeout = opts.timeout or 60000 }, function(out)
    vim.schedule(function()
      if out.code ~= 0 then
        local err = out.stderr ~= "" and out.stderr
          or (out.signal and out.signal ~= 0 and ("gh timed out (signal " .. out.signal .. ")"))
          or ("gh exited with code " .. out.code)
        cb(false, vim.trim(err))
        return
      end
      local stdout = out.stdout or ""
      if opts.raw then
        cb(true, stdout)
        return
      end
      local ok, decoded = pcall(vim.json.decode, stdout, { luanil = { object = true, array = true } })
      cb(true, ok and decoded or stdout)
    end)
  end)
end

function M.api(endpoint, opts, cb)
  opts = opts or {}
  local args = { "api", endpoint }
  if opts.method then
    vim.list_extend(args, { "--method", opts.method })
  end
  if opts.paginate then
    vim.list_extend(args, { "--paginate", "--slurp" })
  end
  local stdin
  if opts.body then
    vim.list_extend(args, { "--input", "-" })
    stdin = vim.json.encode(opts.body)
  end
  M.run(args, { stdin = stdin }, cb)
end

function M.graphql(query, variables, cb)
  local args = { "api", "graphql", "-f", "query=" .. query }
  for k, v in pairs(variables or {}) do
    table.insert(args, "-F")
    table.insert(args, ("%s=%s"):format(k, v))
  end
  M.run(args, {}, cb)
end

function M.gql(query, variables, cb)
  local stdin = vim.json.encode({ query = query, variables = variables or vim.empty_dict() })
  M.run({ "api", "graphql", "--input", "-" }, { stdin = stdin }, function(ok, res)
    if not ok then
      cb(false, res)
      return
    end
    if type(res) == "table" and res.errors and res.errors[1] then
      cb(false, res.errors[1].message or "graphql error")
      return
    end
    cb(true, type(res) == "table" and res.data or res)
  end)
end

function M.flatten(pages)
  local out = {}
  for _, page in ipairs(pages or {}) do
    for _, item in ipairs(page) do
      table.insert(out, item)
    end
  end
  return out
end

return M

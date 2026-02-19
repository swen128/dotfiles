#!/usr/bin/env bun
/*
check-todo — Show unfinished nb todos as a dependency tree.

Usage:
  bun run ~/bin/check-todo.ts
  todos                          # zsh alias

Reads all .todo.md files from nb and displays:
  1. Dependency tree — todos linked by blocked_by, rendered with tree connectors
  2. Independent list — todos with no dependency relationships
  3. What's next — recommended next todo to work on

Expected todo format (.todo.md):

  ---
  status: not_started            # not_started | pending | in_progress | done
  blocked_by:
    - "[[other-todo.todo.md]]"   # wikilink to blocking todo's filename
  ---

  # [ ] Todo Title

  #tag1 #tag2

  - [ ] Subtask one
  - [x] Subtask two (done)

Sample output:

  11 unfinished todo(s)

  ## Dependency Tree

  ⏳ #98 E2E Testing [34/43] (READY)
  ├── ⏳ #83 Data Migration [13/23]
  │   ├── ⬚  #84 Update Permissions [0/20]
  │   └── ⬚  #82 Release UI [0/7]
  └── ⬚  #79 Announcement [0/9]
      └── → #82 (see above)

  ## Independent

  ⬚  #143 Fix printer bug [not_started, 0/3 tasks]

  ## What's Next

  ➤ #98 "E2E Testing" (34/43 subtasks done) — unblocks 2 other todo(s)
    Then: #143 "Fix printer bug"
*/

import { $ } from "bun";

interface Todo {
  id: string;
  filename: string;
  title: string;
  done: boolean;
  status: string;
  blockedByFilenames: string[];
  tags: string[];
  tasksDone: number;
  tasksTotal: number;
}

interface DepNode {
  todo: Todo;
  blocksIds: string[];
  blockedByIds: string[];
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm: Record<string, unknown> = {};
  let currentKey = "";
  let listValues: string[] = [];

  for (const line of m[1].split("\n")) {
    const kvMatch = line.match(/^(\w[\w_]*):\s*(.*)/);
    if (kvMatch) {
      if (currentKey && listValues.length) {
        fm[currentKey] = listValues;
        listValues = [];
      }
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "" || val === "[]") {
        fm[currentKey] = val === "[]" ? [] : undefined;
      } else {
        fm[currentKey] = val;
      }
    } else {
      const itemMatch = line.match(/^\s+-\s+"?\[\[(.+?)\]\]"?/);
      if (itemMatch) {
        listValues.push(itemMatch[1]);
      }
    }
  }
  if (currentKey && listValues.length) {
    fm[currentKey] = listValues;
  }
  return fm;
}

function countTasks(body: string): { done: number; total: number } {
  const checked = (body.match(/^- \[x\]/gm) || []).length;
  const unchecked = (body.match(/^- \[ \]/gm) || []).length;
  return { done: checked, total: checked + unchecked };
}

function extractTitle(body: string): { title: string; done: boolean } {
  const m = body.match(/^# \[([ x])\] (.+)$/m);
  if (m) return { title: m[2].trim(), done: m[1] === "x" };
  return { title: "(untitled)", done: false };
}

function extractTags(body: string): string[] {
  const m = body.match(/^(#\S+(?:\s+#\S+)*)$/m);
  if (!m) return [];
  return m[1].split(/\s+/).map((t) => t.replace(/^#/, ""));
}

async function nb(cmd: string): Promise<string> {
  return await $`bash -c ${cmd}`.text();
}

async function fetchTodos(): Promise<Todo[]> {
  const filenameOutput = await nb(
    "nb list --no-color --filenames --type todo"
  );
  const idToFilename = new Map<string, string>();
  for (const line of filenameOutput.split("\n")) {
    const m = line.match(/^\[(\d+)\]\s+\S+\s+(.+\.todo\.md)/);
    if (m) idToFilename.set(m[1], m[2]);
  }

  const listOutput = await nb("nb todos --no-color");
  const unfinishedIds: string[] = [];
  for (const line of listOutput.split("\n")) {
    const m = line.match(/^\[(\d+)\]\s+\S+\s+\[ \]/);
    if (m) unfinishedIds.push(m[1]);
  }

  const todos: Todo[] = [];
  const reads = unfinishedIds.map(async (id) => {
    const raw = await nb(`nb show ${id} --no-color`);
    const fm = parseFrontmatter(raw);
    const { title, done } = extractTitle(raw);
    const tasks = countTasks(raw);
    const tags = extractTags(raw);
    todos.push({
      id,
      filename: idToFilename.get(id) ?? "",
      title,
      done,
      status: (fm.status as string) ?? "not_started",
      blockedByFilenames: (fm.blocked_by as string[] | undefined) ?? [],
      tags,
      tasksDone: tasks.done,
      tasksTotal: tasks.total,
    });
  });
  await Promise.all(reads);

  return todos;
}

function buildGraph(
  todos: Todo[]
): { dependent: DepNode[]; independent: Todo[] } {
  const filenameToTodo = new Map<string, Todo>();
  for (const t of todos) filenameToTodo.set(t.filename, t);

  const nodes = new Map<string, DepNode>();
  for (const t of todos) {
    nodes.set(t.id, { todo: t, blocksIds: [], blockedByIds: [] });
  }

  for (const t of todos) {
    for (const fname of t.blockedByFilenames) {
      const blocker = filenameToTodo.get(fname);
      if (blocker) {
        nodes.get(t.id)!.blockedByIds.push(blocker.id);
        nodes.get(blocker.id)!.blocksIds.push(t.id);
      }
    }
  }

  const dependent: DepNode[] = [];
  const independent: Todo[] = [];
  for (const [, node] of nodes) {
    if (node.blocksIds.length > 0 || node.blockedByIds.length > 0) {
      dependent.push(node);
    } else {
      independent.push(node.todo);
    }
  }

  return { dependent, independent };
}

function findComponents(nodes: DepNode[]): DepNode[][] {
  const idToNode = new Map<string, DepNode>();
  for (const n of nodes) idToNode.set(n.todo.id, n);

  const visited = new Set<string>();
  const components: DepNode[][] = [];

  function dfs(id: string, component: DepNode[]) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = idToNode.get(id);
    if (!node) return;
    component.push(node);
    for (const bid of node.blocksIds) dfs(bid, component);
    for (const bid of node.blockedByIds) dfs(bid, component);
  }

  for (const n of nodes) {
    if (!visited.has(n.todo.id)) {
      const comp: DepNode[] = [];
      dfs(n.todo.id, comp);
      components.push(comp);
    }
  }

  return components;
}

function statusIcon(status: string): string {
  switch (status) {
    case "in_progress":
      return "🔧";
    case "done":
      return "✅";
    case "pending":
      return "⏳";
    default:
      return "⬚ ";
  }
}

function formatNodeLabel(node: DepNode): string {
  const t = node.todo;
  const tasks = t.tasksTotal > 0 ? ` [${t.tasksDone}/${t.tasksTotal}]` : "";
  const ready = node.blockedByIds.length === 0 ? " (READY)" : "";
  return `${statusIcon(t.status)} #${t.id} ${t.title}${tasks}${ready}`;
}

function renderTree(component: DepNode[]): string[] {
  const idToNode = new Map<string, DepNode>();
  for (const n of component) idToNode.set(n.todo.id, n);

  const roots = component.filter(
    (n) =>
      n.blockedByIds.filter((bid) => idToNode.has(bid)).length === 0
  );

  const rendered = new Set<string>();
  const lines: string[] = [];

  function walk(nodeId: string, prefix: string, isLast: boolean, isRoot: boolean) {
    const node = idToNode.get(nodeId);
    if (!node) return;

    const connector = isRoot ? "" : isLast ? "└── " : "├── ";
    const label = formatNodeLabel(node);

    if (rendered.has(nodeId)) {
      lines.push(`${prefix}${connector}→ #${nodeId} (see above)`);
      return;
    }
    rendered.add(nodeId);

    lines.push(`${prefix}${connector}${label}`);

    const children = node.blocksIds.filter((bid) => idToNode.has(bid));
    const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
    for (let i = 0; i < children.length; i++) {
      walk(children[i], childPrefix, i === children.length - 1, false);
    }
  }

  for (let i = 0; i < roots.length; i++) {
    if (i > 0) lines.push("");
    walk(roots[i].todo.id, "  ", true, true);
  }

  return lines;
}

function renderIndependent(todos: Todo[]): string[] {
  if (todos.length === 0) return [];
  return todos.map((t) => {
    const tasks =
      t.tasksTotal > 0 ? `, ${t.tasksDone}/${t.tasksTotal} tasks` : "";
    return `  ${statusIcon(t.status)} #${t.id} ${t.title} [${t.status}${tasks}]`;
  });
}

function recommend(dependent: DepNode[], independent: Todo[]): string[] {
  const all = [
    ...dependent.map((n) => ({
      todo: n.todo,
      ready: n.blockedByIds.length === 0,
      blocksCount: n.blocksIds.length,
    })),
    ...independent.map((t) => ({
      todo: t,
      ready: true,
      blocksCount: 0,
    })),
  ];

  const ready = all.filter((x) => x.ready);
  ready.sort((a, b) => {
    const aIP = a.todo.status === "in_progress" ? 0 : 1;
    const bIP = b.todo.status === "in_progress" ? 0 : 1;
    if (aIP !== bIP) return aIP - bIP;
    if (b.blocksCount !== a.blocksCount) return b.blocksCount - a.blocksCount;
    return (
      a.todo.tasksTotal - a.todo.tasksDone - (b.todo.tasksTotal - b.todo.tasksDone)
    );
  });

  const lines: string[] = ["", "## What's Next", ""];
  if (ready.length === 0) {
    lines.push("  All todos are blocked. Resolve blockers first.");
    return lines;
  }

  const top = ready[0];
  const tasksInfo =
    top.todo.tasksTotal > 0
      ? ` (${top.todo.tasksDone}/${top.todo.tasksTotal} subtasks done)`
      : "";
  const blocksInfo =
    top.blocksCount > 0 ? ` — unblocks ${top.blocksCount} other todo(s)` : "";
  const statusInfo =
    top.todo.status === "in_progress" ? " — already in progress" : "";
  lines.push(
    `  ➤ #${top.todo.id} "${top.todo.title}"${statusInfo}${tasksInfo}${blocksInfo}`
  );

  if (ready.length > 1) {
    const next = ready[1];
    const nextBlocks =
      next.blocksCount > 0
        ? ` — unblocks ${next.blocksCount} other todo(s)`
        : "";
    lines.push(
      `    Then: #${next.todo.id} "${next.todo.title}"${nextBlocks}`
    );
  }

  return lines;
}

async function main() {
  const todos = await fetchTodos();
  if (todos.length === 0) {
    console.log("No unfinished todos.");
    return;
  }

  const { dependent, independent } = buildGraph(todos);
  const components = findComponents(dependent);

  console.log("");
  console.log(`  ${todos.length} unfinished todo(s)`);
  console.log("");

  if (components.length > 0) {
    console.log("## Dependency Tree");
    console.log("");
    for (let i = 0; i < components.length; i++) {
      const lines = renderTree(components[i]);
      for (const l of lines) console.log(l);
      if (i < components.length - 1) console.log("");
    }
  }

  if (independent.length > 0) {
    if (components.length > 0) console.log("");
    console.log("## Independent");
    console.log("");
    const lines = renderIndependent(independent);
    for (const l of lines) console.log(l);
  }

  const recLines = recommend(dependent, independent);
  for (const l of recLines) console.log(l);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

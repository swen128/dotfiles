/*
reminders — manage macOS Reminders from the CLI (AI-facing, JSON I/O).
Invoke via: bun "${CLAUDE_SKILL_DIR}/reminders.ts" <subcommand>

Usage:
  reminders ls [list]                  JSON array of open reminders {id, name, list, due}
  reminders lists                      JSON array of list names
  reminders add <text> [-l list] [-d due]
                                       Create a reminder. Prints {id} as JSON.
  reminders done <id>                  Mark reminder complete
  reminders rm <id>                    Delete reminder
  reminders edit <id> [-n name] [-d due] [-l list]
                                       Update fields.

`-d` takes an ISO-8601 datetime ("2026-05-15T17:00:00"). A trailing `Z` or
offset is honoured; otherwise it's interpreted as local time. The reminder's
due date is stored in local time.
*/

type Reminder = {
  id: string;
  name: string;
  list: string;
  due: string;
};

async function osa(script: string): Promise<string> {
  const proc = Bun.spawn(["osascript", "-e", script], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `osascript exited ${code}`);
  }
  return stdout.replace(/\n$/, "");
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Build an AppleScript block that assigns an ISO-8601 datetime to `varName`.
// Components are set explicitly so AppleScript's locale/parser is irrelevant.
// `set day to 1` first avoids month-rollover (e.g. Jan 31 → set month=Feb).
function dateBlock(iso: string, varName: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return [
    `set ${varName} to (current date)`,
    `set day of ${varName} to 1`,
    `set year of ${varName} to ${dt.getFullYear()}`,
    `set month of ${varName} to ${MONTHS[dt.getMonth()]}`,
    `set day of ${varName} to ${dt.getDate()}`,
    `set hours of ${varName} to ${dt.getHours()}`,
    `set minutes of ${varName} to ${dt.getMinutes()}`,
    `set seconds of ${varName} to ${dt.getSeconds()}`,
  ].join("\n    ");
}

const FS = "␟";
const RS = "␞";

async function getLists(): Promise<string[]> {
  const out = await osa(`tell application "Reminders"
    set out to ""
    repeat with l in lists
      set out to out & (name of l) & linefeed
    end repeat
    return out
  end tell`);
  return out.split("\n").filter((s) => s.length > 0);
}

async function getOpenReminders(listName?: string): Promise<Reminder[]> {
  const target = listName ? `{list ${quote(listName)}}` : `every list`;
  const script = `tell application "Reminders"
    set out to ""
    repeat with l in (${target})
      repeat with r in (reminders of l whose completed is false)
        set rid to id of r
        set rname to name of r
        set rdue to ""
        try
          set d to due date of r
          if d is not missing value then set rdue to d as string
        end try
        set out to out & rid & "${FS}" & rname & "${FS}" & (name of l) & "${FS}" & rdue & "${RS}"
      end repeat
    end repeat
    return out
  end tell`;
  const out = await osa(script);
  if (!out) return [];
  return out
    .split(RS)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((row) => {
      const [id, name, list, due] = row.split(FS);
      return { id, name, list, due };
    });
}

async function addReminder(
  name: string,
  listName?: string,
  due?: string,
): Promise<string> {
  const props: string[] = [`name:${quote(name)}`];
  const preamble = due ? dateBlock(due, "dueDate") : "";
  if (due) props.push(`due date:dueDate`);
  const target = listName ? `list ${quote(listName)}` : `default list`;
  return await osa(`tell application "Reminders"
    ${preamble}
    tell ${target}
      set r to make new reminder with properties {${props.join(", ")}}
      return id of r
    end tell
  end tell`);
}

async function completeReminder(id: string): Promise<void> {
  await osa(`tell application "Reminders"
    set completed of (first reminder whose id is ${quote(id)}) to true
  end tell`);
}

async function deleteReminder(id: string): Promise<void> {
  await osa(`tell application "Reminders"
    delete (first reminder whose id is ${quote(id)})
  end tell`);
}

async function updateReminder(
  id: string,
  changes: { name?: string; due?: string; list?: string },
): Promise<void> {
  const stmts: string[] = [];
  let preamble = "";
  if (changes.name !== undefined) {
    stmts.push(`set name of r to ${quote(changes.name)}`);
  }
  if (changes.due !== undefined) {
    preamble = dateBlock(changes.due, "dueDate");
    stmts.push(`set due date of r to dueDate`);
  }
  if (changes.list !== undefined) {
    stmts.push(`move r to list ${quote(changes.list)}`);
  }
  if (stmts.length === 0) return;
  await osa(`tell application "Reminders"
    ${preamble}
    set r to first reminder whose id is ${quote(id)}
    ${stmts.join("\n    ")}
  end tell`);
}

function parseFlag(args: string[], ...flags: string[]): string | undefined {
  for (const flag of flags) {
    const i = args.indexOf(flag);
    if (i === -1) continue;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  }
  return undefined;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case undefined:
    case "ls": {
      console.log(JSON.stringify(await getOpenReminders(rest[0]), null, 2));
      return;
    }
    case "lists": {
      console.log(JSON.stringify(await getLists(), null, 2));
      return;
    }
    case "add": {
      const list = parseFlag(rest, "-l", "--list");
      const due = parseFlag(rest, "-d", "--due");
      const text = rest.join(" ").trim();
      if (!text) die("Usage: reminders add <text> [-l list] [-d due]");
      const id = await addReminder(text, list, due);
      console.log(JSON.stringify({ id }));
      return;
    }
    case "done": {
      const id = rest[0];
      if (!id) die("Usage: reminders done <id>");
      await completeReminder(id);
      return;
    }
    case "rm": {
      const id = rest[0];
      if (!id) die("Usage: reminders rm <id>");
      await deleteReminder(id);
      return;
    }
    case "edit": {
      const id = rest.shift();
      if (!id) {
        die("Usage: reminders edit <id> [-n name] [-d due] [-l list]");
      }
      const name = parseFlag(rest, "-n", "--name");
      const due = parseFlag(rest, "-d", "--due");
      const list = parseFlag(rest, "-l", "--list");
      if (name === undefined && due === undefined && list === undefined) {
        die("reminders edit: provide at least one of -n, -d, -l");
      }
      if (due === "") die("reminders edit: clearing the due date is not supported");
      await updateReminder(id, { name, due, list });
      return;
    }
    case "-h":
    case "--help":
    case "help": {
      console.log(`Usage:
  reminders ls [list]                  Open reminders as JSON
  reminders lists                      List names as JSON
  reminders add <text> [-l list] [-d due]
                                       Create a reminder; prints {"id": "..."}
  reminders done <id>                  Complete a reminder
  reminders rm <id>                    Delete a reminder
  reminders edit <id> [-n name] [-d due] [-l list]
                                       Update fields`);
      return;
    }
    default:
      die(`Unknown command: ${cmd}\nRun 'reminders help' for usage.`);
  }
}

await main();

---
name: reminder
description: 'Manage macOS Reminders from the CLI. Triggers on phrases like "remind me to ...", "add a reminder", "list my reminders", "complete the reminder about ...", "delete the reminder"'
---

Invoke: `scripts/reminders.ts <args>`

```
ls [list]                                JSON [{id, name, list, due}]
lists                                    JSON string[]
add <text> [-l list] [-d due]            prints {"id": "..."}
done <id>
rm   <id>
edit <id> [-n name] [-d due] [-l list]
```

`-d` takes ISO-8601 (`2026-05-15T17:00:00`; trailing `Z`/offset honoured, else local).

To mutate a specific reminder: `ls`, match by `name`, pass the `id`.

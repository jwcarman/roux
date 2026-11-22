---
tags: [skill-creator]
max_turns: 80
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Add an Events page. The owner keeps the school's events: each has a name (required, at most 60 characters), a start date and an end date (both required, and the end date must be after the start date; say 'Must be after the start date' under the end date otherwise). Show them in a table, soonest first, and let the owner add and edit them in a dialog. Only the owner can see or change events.

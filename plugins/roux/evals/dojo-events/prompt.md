---
tags: [skill-creator]
max_turns: 80
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Add an Events page. The owner keeps the school's events: each has a name (required, at most 60 characters), a start date and an end date (both required, and the end date must be after the start date; say 'Must be after the start date' under the end date otherwise). Show them in a table, soonest first, and let the owner add and edit them in a dialog. Only the owner can see or change events.

Other code and tests rely on this contract, so keep to it exactly:

- `GET /api/events` answers every event as `[{"id", "name", "startDate", "endDate", "version"}]`, soonest first (by start date). Dates are `YYYY-MM-DD`.
- `POST /api/events` with `{"name", "startDate", "endDate"}` adds one and answers `201` with the new event.
- `PUT /api/events/{id}` with `{"name", "startDate", "endDate", "version"}` changes one and answers `200` with it.
- A name that is refused (blank or too long) is a `400` whose problem details name the field `name`.
- An end date that is not after the start date is a `400` whose problem details name the field `endDate` with the message `Must be after the start date`.
- The page is at `/events`, linked as "Events" in the main navigation. Its table is named "Events", with the columns Name, Start date and End date.
- A "New event" button opens a dialog titled "New event", with the fields Name, Start date and End date and a Save button. Each row has an "Edit" button that opens the same dialog, titled "Edit" and the event's name, to change it.

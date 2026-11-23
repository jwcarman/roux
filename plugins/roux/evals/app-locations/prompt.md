---
tags: [skill-creator]
max_turns: 80
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Add a Locations page. The owner keeps the school's training locations: each has a name (required, at most 40 characters, unique) and a kind (main dojo, satellite or outdoor). Show them in a table and let the owner add and edit them in a dialog. Only the owner can see or change locations.

Other code and tests rely on this contract, so keep to it exactly:

- `GET /api/locations` answers every location as `[{"id", "name", "kind", "version"}]`, sorted by name.
- `POST /api/locations` with `{"name", "kind"}` adds one and answers `201` with the new location.
- `PUT /api/locations/{id}` with `{"name", "kind", "version"}` changes one and answers `200` with it.
- `kind` is `MAIN_DOJO`, `SATELLITE` or `OUTDOOR`.
- A name that is refused (blank, too long, or another location's) is a `400` whose problem details name the field `name`.
- The page is at `/locations`, linked as "Locations" in the main navigation. Its table is named "Locations", with the columns Name and Kind; a kind shows as Main dojo, Satellite or Outdoor.
- A "New location" button opens a dialog titled "New location", with the fields Name and Kind and a Save button. Each row has an "Edit" button that opens the same dialog, titled "Edit" and the location's name, to change it.

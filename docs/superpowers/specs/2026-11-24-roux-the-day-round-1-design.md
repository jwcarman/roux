# Roux The Day, round one: the team's items, and a paginator

## Intent

Roux The Day is the example app roux grows from (see `2026-11-24-go-runtime-design.md`): a team's
shared planner, built in rounds, each logging what was hard in `FINDINGS.md`, with what more than
one app would need extracted into roux.

Round one builds the planner's items and the list of them. Its second purpose is a paginator for
Go that is as pleasant as jpa-utils' (`Paginator`, sort enums, `@Searchable`): written inside the
app first, used until it feels right, then extracted into roux's `page` package. James: "build
something inside the example application first and get it working to our liking and then
extract it."

## Goals

- An item: a title, optional notes, a day, all-day or at a time of day (in the team's time
  zone), one or more assignees from the team, open or done. Editing from a stale version is a 409.
- The items page: search by words; filters for when (overdue, today, this week, all), assignee
  (anyone, mine, a person) and status (open, done); sort by day, title or assignee; paging.
- Add and edit in a dialog, as the template's Users page does.
- A paginator in the app, modelled on jpa-utils (below), that both the items list and anything
  later in the app can use.
- `FINDINGS.md` started, with every friction met.

## Non-goals (later rounds)

A "my day" view, an item's history (the activity log), email on assignment, checking an item off
safely from two devices at once, an organizer role. Extracting the paginator into roux is the
step after this round, not part of it.

## Anti-goals

- The app does not reach around roux: if something roux should do is missing, the app does the
  smallest thing that works and `FINDINGS.md` says so.
- The paginator does not become an ORM or a query builder: the app still writes SQL.

## Constraints

- `examples/roux-the-day` starts as a copy of `template/` (module path `roux-the-day`), with its
  own `go.mod` and a `replace` onto `../..`, per the Go runtime design.
- The template's gates hold: Go `make check`, the frontend's format, lint, typecheck, 100%
  coverage, build and mutation, and e2e.
- roux is public and so is the example; nothing private is copied in.
- No warning suppression, no star imports (CLAUDE.md).

## Approaches considered

1. **roux writes the whole query from a declaration** (table, columns, sorts, search): closest to
   jpa-utils, but anything unusual needs a way out.
2. **The app writes its whole `SELECT`, roux adds paging**: full control, but every list repeats
   the count, the order and the search.
3. **A paginator over a read model (chosen).** A list reads one table or view shaped for it, as the
   Java roux's `StudentListEntry` and `UserDirectoryEntry` did. The paginator is declared once with
   that view, its columns, its sorts and its search columns; per request the app adds filters as
   SQL fragments. Anything unusual goes into the view. James picked the paginator, inside `page`
   eventually, built in the example first.

## The paginator (in the app: `internal/paging`)

Declared once per list, as jpa-utils' `static final Paginator`:

```go
type ItemSort string

const (
	ByDay      ItemSort = "DAY"
	ByTitle    ItemSort = "TITLE"
	ByAssignee ItemSort = "ASSIGNEE"
)

var itemPages = paging.New(paging.Config[ItemSort, Item]{
	From:    "item_list",                        // a view shaped for the list
	Columns: "id, title, day, at, done, assignee_names, version",
	Sorts: map[ItemSort]string{                  // the name a client sends -> the SQL it sorts by
		ByDay: "day, at nulls first", ByTitle: "lower(title)", ByAssignee: "first_assignee_name",
	},
	DefaultSort: ByDay,
	Search:      []paging.Field{paging.Contains("title"), paging.Contains("notes")},
	Scan:        scanItem,                       // func(pgx.CollectableRow) (Item, error)
})
```

- `paging.New` checks the configuration as jpa-utils does when a paginator is built (a default sort
  that is one of the sorts, a default page size within the maximum, at least one sort or a
  tiebreaker) and panics on a mistake: it runs at package initialization, so a mistake stops the
  app before it serves anything.
- `p.Check(ctx, db)` runs `select <columns>, <sort expressions> from <from> where false` and so
  finds a misspelled column; the module calls it when the app starts (a `Starter`), and a test
  calls it against the migrated schema.
- `p.Config()` is a `page.Config` (sort names, default, sizes, tiebreaker `id`), so the handler
  keeps `api.PageRequest(r, itemPages.Config())` and the HTTP contract is unchanged.
- `p.Page(ctx, db, req, search, filters...) (page.Page[Item], error)` runs the count and the page
  query: `select <columns> from <from> where <filters and search> order by <sort> <dir>, id <dir>
  limit .. offset ..`.
- Filters: `paging.Where("day < ?", today)` with `?` placeholders, numbered `$1..$n` for the
  whole statement; `paging.WhereIf(cond, ...)` adds one only when `cond`. A `?` inside a SQL
  string literal or Postgres's jsonb `?` operator is not supported (documented, and a finding if it
  bites).
- Search, as jpa-utils: the term is split into lower-cased words (duplicates dropped, at most 10);
  a row matches when every word matches at least one search field; `Contains` (`lower(col) like
  '%w%' escape '\'`), `Prefix` and `Exact`, with `%`, `_` and `\` escaped.
- Generic over the row type because Go methods cannot have type parameters of their own (unlike
  Java's generic `paginate`): one paginator per list, holding its `Scan`.

## The items feature

**Schema** (`cmd/server/migrations/002_items.sql`, after the template's `001_roles.sql`; the
app's migration already runs after `roux-users`, so the view can read `roux_user_directory`):

- `item`: `id uuid`, `title text` (1–120), `notes text` (0–2000), `day date`, `at time` (null:
  all day), `done boolean`, `version int`, `created_at`, `created_by` (identity).
- `item_assignee`: `item_id`, `user_id` (roux's user directory), primary key both.
- `item_list` view: the item's columns plus `assignee_ids uuid[]`, `assignee_names text[]` (by
  name) and `first_assignee_name` (for the sort), from `roux_user_directory`.

**Permissions**: `items.read` and `items.write`, both granted to USER and OWNER in
`cmd/server/migrations/003_item_permissions.sql`; added to `permissions.gen.ts` by hand (roux has no Go
generator for it yet: a finding).

**API** (`/api/items`, roux's problem details and version checks):

- `GET /api/items?search=&when=overdue|today|week|all&assignee=me|<user id>&status=open|done`
  plus `pageIndex, pageSize, sortBy, sortDirection`: a page of items.
- `POST /api/items`, `GET /api/items/{id}`, `PUT /api/items/{id}` (with `version`; stale is 409),
  `DELETE /api/items/{id}`.
- `when` uses the team's time zone (the organization's): overdue is open and before today; today is
  today; this week is Monday to Sunday of the current week.
- Assignees must be active users of the team; at least one.

**Frontend**: an Items page in the nav (needs `items.read`), with roux-web's table, search input,
filter chips and paging, sorting by the three sorts; add and edit in a `FormDialog` (title, notes,
day, all-day or time, assignees). Whatever roux-web lacks (a date or time field, choosing several
people) is built in the app as simply as works, and logged in `FINDINGS.md`.

**Tests**: Go tests against Postgres (pgtest) for the paginator (filters, search modes, sorts,
tiebreak, `Check` finding a bad column) and the API (each filter, 409, validation, permissions);
frontend tests at the template's 100% gates; one e2e test that adds an item and finds it by
search and filter.

**CI**: a job for `examples/roux-the-day` like the template's (Go check, frontend gates, e2e).

## Settled after a builder's read (calls made here, not by James)

- **Starting point.** A plain copy of `template/`: the Go template ships no items resource (the Java
  one's `examples/items` is gone), so items are built, not adapted.
- **Assignees in the view.** `assignee_names` are `roux_user_directory.display_name`, ordered by
  `lower(display_name)` then id; `first_assignee_name` is the first of that order. A deactivated
  user stays on the items they had, by name, but cannot be newly assigned.
- **"Mine" and "a person".** A user's id is their identity id (as in `users`), so `assignee=me` is
  the caller's identity. `assignee=<id>` that is not a UUID is a 400 on `assignee`; a UUID of nobody
  simply matches nothing.
- **When and status.** They combine with *and*: `when=overdue` means open and before today, so with
  `status=done` it is empty. Overdue is by day only: a timed item earlier today is "today", not
  overdue. The week starts on Monday.
- **The time of an item.** `at` is a wall-clock time in the team's zone, stored as `time` and
  never converted. The JSON is `"day": "2026-11-24"` and `"at": "10:30"` or `null` for all day
  (no separate flag); a time with seconds is refused.
- **`?` in a string literal.** Documented as unsupported, with a test showing the failure it
  gives, so nobody learns it from a production bug.
- **`Check` at start.** It runs in the module's `Start` against the real database, and a failure
  stops the app: that is the point of it. Tests that assemble the app run it too.
- **e2e.** The test signs in as the owner, invites a second person through the API, and assigns
  an item to both; nothing is seeded.
- **CI.** A `roux-the-day` job like the template's (Go checks, then the frontend's gates); its
  e2e suite runs locally, as the template's does until create-roux-app ships the Go template.

## Left to the builder

Names below `internal/` other than `paging`, the exact view SQL, page layout details within
roux-web's components, and how `FINDINGS.md` entries are worded (each: what was hard, what roux
could do, which file).

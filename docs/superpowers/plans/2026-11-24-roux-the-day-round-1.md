# Roux The Day, round one: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `examples/roux-the-day` from the template, with a team's items (add, edit, delete, a
searchable, filterable, sortable, paged list) built on an in-app, jpa-utils-style paginator.

**Architecture:** The app is a copy of `template/` with its own `go.mod` (`replace` onto `../..`).
An `internal/paging` package holds the paginator; an `internal/items` package is an `app.Module`
(migrations, routes, a start-up `Check`). The frontend adds an Items page built from roux-web.

**Tech Stack:** Go 1.27, pgx v5, Postgres 17 (pgtest), React 19, Chakra 3, TanStack Router/Query/
Table/Form, zod, Vitest, Stryker, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-roux-the-day-round-1-design.md`

## Global Constraints

- Module path `roux-the-day`; `go.mod` has `replace github.com/jwcarman/roux => ../..`.
- The template's gates hold: Go `make check` (fmt, vet, lint, test); frontend format:check, lint,
  typecheck, 100% coverage, build, `npm run mutate` (break at 100); e2e passes locally.
- No warning suppression (no `eslint-disable`, `//nolint`, `@ts-expect-error` as suppression); no
  star imports; no license headers.
- Every SQL-text parameter of the paginator has the unexported type `sqlText`; values only as args.
- Permissions: `items.read`, `items.write` (USER and OWNER), `items.delete.any` (OWNER only).
- Limits: title 1–120 characters after trimming; notes 0–2000; assignees 1–50, deduplicated;
  search term ≤ 200 characters, ≤ 10 distinct words; `at` is `HH:MM`, `00:00`–`23:59`.
- Endpoints live under `/api/items` (app routes, `Mux.Handle`, through `Host.Guard`).
- Commit straight to main; run the gates locally before pushing.

## Review Focus

1. A search with `%`, `_` or `\` finds the literal character, not everything. (Task 2 test.)
2. A sort by day with descending direction sorts both `day` and `at_time` descending, all-day
   items first within a day ascending and last descending. (Task 2 test.)
3. "Today" for a team in `Pacific/Auckland` when it is still yesterday in UTC. (Task 4 test.)
4. Editing assignees only bumps the version, so a second stale edit is a 409. (Task 4 test.)
5. An item whose only assignee is later deactivated still lists, and the edit dialog can save it
   after replacing the assignee. (Task 4 API test; Task 5 dialog test.)

---

### Task 1: The app, copied from the template

**Files:**
- Create: `examples/roux-the-day/` (a copy of `template/` without `node_modules`, `dist`, `bin`,
  `coverage*`, `test-results`, `reports`, `.stryker-tmp`)
- Modify in the copy: `go.mod` (module `roux-the-day`, `replace ... => ../..`), every
  `roux-app/...` import, `Makefile` binary names (`bin/roux-the-day`), `cmd/server/main.go`
  service name and default `APP_NAME` ("Roux The Day"), `frontend/package.json` (name
  `roux-the-day-web`, `@jwcarman/roux-web` → `file:../../../web/roux-web`), `e2e/package.json`
  likewise if it references paths, `compose.yaml` names.
- Create: `examples/roux-the-day/FINDINGS.md` (heading, one-paragraph purpose, an empty
  "Round one" section; each entry: what was hard, what roux could do, which file).

- [ ] **Step 1:** Copy with `rsync -a --exclude` the list above; rewrite names with a script.
- [ ] **Step 2:** Run `go mod tidy && make check` in `examples/roux-the-day`.
  Expected: all pass (same tests as the template).
- [ ] **Step 3:** Run `npm ci && npm run typecheck && npm run lint && npm run coverage && npm run build`
  in `examples/roux-the-day/frontend` (use the template's script names).
  Expected: pass, 100% coverage.
- [ ] **Step 4:** Commit `Roux The Day: a copy of the template`.

### Task 2: The paginator (`internal/paging`)

Also fixes roux: `page.Config.Resolve` refuses a direction other than `""`, `ASC`, `DESC`.

**Files:**
- Modify: `page/page.go`, `page/page_test.go` (roux root)
- Create: `examples/roux-the-day/internal/paging/paging.go`, `filter.go`, `search.go`,
  `paging_test.go`, `filter_test.go`

**Interfaces:**
- Produces:
  ```go
  type sqlText string // unexported: only untyped constants convert to it
  type Term struct{ /* expr sqlText; nullsFirst bool */ }
  func By(expr sqlText) Term
  func (t Term) NullsFirst() Term
  type Field struct{ /* col sqlText; mode */ }
  func Contains(col sqlText) Field
  func Prefix(col sqlText) Field
  func Exact(col sqlText) Field
  type Filter struct{ /* frag sqlText; args []any; on bool */ }
  func Where(frag sqlText, args ...any) Filter          // panics: ? count != len(args), or ' " -- /* ; $
  func WhereIf(cond bool, frag sqlText, args ...any) Filter // validated even when !cond
  type Querier interface {
      Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
      QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
  }
  type Config[S ~string, T any] struct {
      From, Columns   sqlText
      Sorts           map[S][]Term
      DefaultSort     S
      DefaultPageSize int // 0: page's default
      MaxPageSize     int // 0: page's default
      Search          []Field
      Scan            func(pgx.CollectableRow) (T, error)
  }
  type Paginator[S ~string, T any] struct{ /* ... */ }
  func New[S ~string, T any](cfg Config[S, T]) *Paginator[S, T] // panics on a bad config
  func (p *Paginator[S, T]) Config() page.Config                 // SortFields sorted
  func (p *Paginator[S, T]) Page(ctx context.Context, db Querier, req page.Request, search string, filters ...Filter) (page.Page[T], error)
  func (p *Paginator[S, T]) Check(ctx context.Context, db Querier) error
  const MaxSearchLength = 200
  ```
- `Page` returns `problem.InvalidField("search", problem.MustBeBetween(0, MaxSearchLength))` for a
  longer term. The SQL: `select count(*) from <From> where <conds>` then
  `select <Columns> from <From> where <conds> order by <terms dir>, id <dir> limit $n offset $n+1`,
  where `<conds>` is `true` with no filters, each filter in parentheses, joined by `and`, then
  one condition per search word: `(` its fields' matches joined by ` or ` `)`. The direction comes
  from a switch: `page.Desc` → `DESC`, anything else → `ASC`. `NullsFirst` writes `NULLS FIRST`
  ascending and `NULLS LAST` descending (all-day first in a day ascending, Review Focus 2).
- `New` panics when: no sorts; `DefaultSort` not a key of `Sorts`; a sort with no terms;
  `DefaultPageSize > MaxPageSize`; `Scan` nil; `From` or `Columns` empty.
- `Check` runs the page query with `where false` for every sort and both directions.

- [ ] **Step 1: roux's direction test (failing)** in `page/page_test.go`:
  `TestResolveRefusesADirectionItDoesNotKnow`: `Config{SortFields: []string{"NAME"}}.Resolve(nil, nil, "NAME", "SIDEWAYS")` returns an error.
- [ ] **Step 2:** `go test ./page/` → FAIL. Make `Resolve` return
  `fmt.Errorf("page: unknown sort direction %q", dir)` for anything but `""`, `Asc`, `Desc`;
  `go test ./page/ ./api/ ./users/` → PASS. Commit `page: Resolve refuses an unknown direction`.
- [ ] **Step 3: filter tests (failing)** `filter_test.go` (no database):
  `TestWhereNumbersPlaceholdersAcrossFilters` (two filters `a = ?`, `b = ? or c = ?` render as
  `(a = $1) and (b = $2 or c = $3)` with args in order); `TestWherePanicsOnACountMismatch`;
  `TestWhereRefusesQuotesCommentsSemicolonsAndDollars` (one subtest per `'`, `"`, `--`, `/*`, `;`,
  `$1`); `TestWhereIfLeavesAFilterOut`.
- [ ] **Step 4:** Implement `filter.go`; tests PASS.
- [ ] **Step 5: paginator tests (failing)** `paging_test.go` against pgtest schema `paging`, a
  table `thing(id uuid primary key, name text, code text, day date, at_time time)` with a handful
  of rows and a `Paginator[ThingSort, thing]`:
  - `TestPageSortsByTheRequestedSortThenID` (ties on `name` ordered by `id`, both directions)
  - `TestNullsFirstFlipsWithTheDirection` (Review Focus 2)
  - `TestSearchNeedsEveryWordInSomeField` (`"ada smi"` finds Ada Smith whose words are in two columns; `"ada brown"` finds nobody)
  - `TestSearchModes` (Contains, Prefix, Exact)
  - `TestSearchMatchesPercentUnderscoreAndBackslashLiterally` (Review Focus 1)
  - `TestSearchIgnoresCaseDuplicatesAndAnEleventhWord`
  - `TestSearchRefusesATermOver200Characters` (400 on `search`)
  - `TestPageCountsAllMatchesAndReturnsOnePage` (Pagination total, size, index)
  - `TestNewPanicsOnABadConfig` (one subtest per rule above)
  - `TestConfigListsSortsInOrder` (`SortFields` sorted; default set)
  - `TestCheckFindsAMisspelledColumn` (a paginator with `Columns: "nmae"` → error; the good one → nil)
- [ ] **Step 6:** Implement `paging.go` and `search.go` (reuse users' rules: lower-case, split on
  whitespace, dedupe, ≤10 words, escape `\ % _`, `like ... escape '\'`); tests PASS; `make check` PASS.
- [ ] **Step 7:** Commit `Roux The Day: a paginator, after jpa-utils`.

### Task 3: Items schema and permissions

**Files:**
- Create: `examples/roux-the-day/internal/items/migrations/001_items.sql`,
  `002_permissions.sql`
- Create: `examples/roux-the-day/internal/items/items.go` (module, constants)

**Interfaces:**
- Produces: `const ItemsRead = "items.read"; ItemsWrite = "items.write"; ItemsDeleteAny = "items.delete.any"`;
  `type Module struct{ Clock func() time.Time }` with `Name() "items"`,
  `Migrations()` → `[]pgdb.Migration{{Name: "items", FS: migrations, Dir: "migrations", After: []string{"roux-users", "app-roles"}}}`.

- Schema per spec: `item` (`id uuid primary key default gen_random_uuid()`, `title text not null
  check (char_length(title) between 1 and 120)`, `notes text not null default '' check
  (char_length(notes) <= 2000)`, `day date not null`, `at_time time`, `done boolean not null default
  false`, `version int not null default 0`, `created_at timestamptz not null`, `created_by uuid not
  null`, `modified_at timestamptz not null`, `modified_by uuid not null`); `item_assignee(item_id
  uuid references item on delete cascade, user_id uuid not null, primary key (item_id, user_id))`;
  view `item_list` (named columns: item's columns, `assignee_ids uuid[]`, `assignee_names text[]`
  ordered by `lower(display_name), id`, `first_assignee_name text`), never `email`.
- `002_permissions.sql`: grants per Global Constraints, `on conflict do nothing`.
- Ruling taken here: the migrations live with the items module (`internal/items/migrations`), not
  `cmd/server/migrations`, so the feature is one package; the spec's path was a guess before the
  module existed.

- [ ] **Step 1:** Write the migrations and the module's `Migrations()`; a test
  `TestTheMigrationsRunAndGrantThePermissions` (pgtest schema `items`, users' migrations plus
  app roles, then items): `USER` has `items.read`, `items.write`, not `items.delete.any`; `OWNER`
  has all three. FAIL, then PASS.
- [ ] **Step 2:** Commit `Roux The Day: items' tables and permissions`.

### Task 4: Items API

**Files:**
- Create: `internal/items/service.go`, `handlers.go`, `when.go`, `items_test.go`, `fixture_test.go`
- Modify: `cmd/server/modules.go` (append `&items.Module{}` when there is a database)

**Interfaces:**
- Consumes: Task 2's paginator; Task 3's constants and module.
- Produces (JSON):
  - list row `{"id","title","day":"2026-11-24","at":"10:30"|null,"done","assigneeNames":[...],"version"}`
  - detail `{...row, "notes", "assignees":[{"id","name"}], "createdBy", "canDelete": bool}`
  - write body `{"title","notes","day","at","assigneeIds":[...],"done","version"}` (`version` on PUT only)
- Module: `Mount(ctx, k)` registers routes with `k.Mux.Handle` and `k.Host.Guard`, keeps
  `k.Organization` for the zone; `Start(ctx, k)` runs `itemPages.Check(ctx, k.Pool)`.
- Routes:
  - `GET /api/items` (`items.read`): `when` ∈ `overdue|today|week|all` (default `all`), `status`
    ∈ `open|done` (default none), `assignee` = `me` or a UUID; other values 400 on the field.
    Filters: overdue `not done and day < $today`; today `day = $today`; week `day between $monday and $sunday`;
    assignee `assignee_ids && ?` with a one-element array; status `done = ?`.
  - `POST /api/items` (`items.write`) → 201 detail; `GET /api/items/{id}` (`items.read`) → detail
    or 404; `PUT /api/items/{id}` (`items.write`) → detail, stale → `problem.StaleVersion()`;
    `DELETE /api/items/{id}` (`items.write`) → 204, 403 unless `created_by` is the caller or the
    caller `Has(ItemsDeleteAny)`.
- `today(clock, zone string) civil date`: `clock().In(time.LoadLocation(zone))` truncated to a date;
  week Monday–Sunday.
- A write runs in one transaction: `select ... for update`, compare version, check assignees are
  active users (`roux_user_directory`, status `ACTIVE`) else 400 on `assigneeIds`, replace
  `item_assignee`, bump `version`, set `modified_*`.

- [ ] **Step 1: tests (failing)** with an `authntest` env over users + app roles + items and three
  people (Olive OWNER, Ada and Grace USER):
  - `TestEveryEndpointChecksItsPermission` (401 anonymous, 403 without the permission, each route)
  - `TestAddingAnItemReturnsItsDetail` and `TestAnItemNeedsATitleADayAndAnAssignee` (400s per field: blank title, title 121, notes 2001, bad day, `at` `24:00` and `10:30:00`, no assignees, 51 assignees, an unknown or deactivated assignee)
  - `TestDuplicateAssigneesCountOnce`
  - `TestListFilters` (subtests: overdue, today, week across a Sunday→Monday, mine, a person, open, done, overdue+done is empty)
  - `TestTodayIsTheTeamsToday` (zone `Pacific/Auckland`, clock 2026-11-24 12:00 UTC → today is 2026-11-25; Review Focus 3)
  - `TestListRefusesAnUnknownWhenStatusOrAssignee`
  - `TestEditingFromAStaleVersionIsAConflict` and `TestChangingOnlyAssigneesBumpsTheVersion` (Review Focus 4)
  - `TestAnItemKeepsADeactivatedAssignee` (still listed with the name; a PUT replacing them succeeds; a PUT keeping them is 400; Review Focus 5)
  - `TestOnlyTheAuthorOrAnOwnerMayDelete` (Grace's delete of Ada's item 403; Ada's 204; Olive's 204)
  - `TestTheModuleChecksItsPaginatorAtStart`
- [ ] **Step 2:** Run `go test ./internal/items/` → FAIL. Implement; → PASS; `make check` PASS.
- [ ] **Step 3:** Add a FINDINGS entry for anything roux lacked (e.g. a Go type for a civil date,
  checking active users from another module).
- [ ] **Step 4:** Commit `Roux The Day: the items API`.

### Task 5: The Items page

**Files:**
- Create: `frontend/src/items/items.ts`, `ItemsPage.tsx`, `ItemForm.tsx`, `ItemDetail.tsx` (if a
  route is used for edit), their tests; `frontend/src/routes/_signedIn/items/index.tsx` (+ test)
- Modify: `frontend/src/api.ts` (`ItemRow`, `ItemDetail`), `queryKeys.ts` (`items`),
  `permissions.gen.ts` (by hand: `ITEMS_READ`, `ITEMS_WRITE`, `ITEMS_DELETE_ANY`; FINDINGS entry),
  `shell/nav.ts` (Items, icon `LuListTodo`, `items.read`, description "The team's plans: what is
  happening, when, and who has it.")

**Interfaces:**
- Consumes: Task 4's JSON. `ITEM_SORTS = ["DAY","TITLE","ASSIGNEE"]`, defaults `sortBy "DAY"`, ASC.
- URL search: `TableSearch<ItemSort> & { when?, assignee?, status? }`.

- Page: `PageHeader` "Items" with an "Add item" button (needs `items.write`); `DebouncedSearchInput`;
  `FilterChips` for When (`Overdue`, `Today`, `This week`, all label `Any time`), Assignee
  (`Mine`, all label `Anyone`; a person comes from a URL only this round), Status (`Open`, `Done`,
  all label `Any status`); `QueryTable` columns Day (day plus time or "All day"), Title (opens the
  edit dialog), Assigned to (names joined), Status.
- Form dialog: title, notes (TextAreaField), day (`date()` rule, `<input type="date">`), all day
  checkbox, time (`time()` rule) shown when not all day, assignees (checkboxes over the active team
  from `/api/roux/users?status=ACTIVE&pageSize=100`); edit adds Done and, when `canDelete`, Delete
  (with roux-web's confirm). 409 shows roux-web's stale-version message.

- [ ] **Step 1:** Tests first per component (MSW handlers for `/api/items` and users), covering
  each filter's URL, the add and edit flows, delete shown only with `canDelete`, the 409 path, and
  Review Focus 5 (replace a deactivated assignee and save).
- [ ] **Step 2:** Implement; run format:check, lint, typecheck, coverage (100%), build,
  `npm run mutate` → all pass.
- [ ] **Step 3:** FINDINGS entries for gaps (multi-person choice, date and time fields, the
  hand-edited permissions file).
- [ ] **Step 4:** Commit `Roux The Day: the items page`.

### Task 6: e2e

**Files:** Create `e2e/tests/items.spec.ts`.

- [ ] **Step 1:** Test: sign in as the owner; invite Ada through the API; add "Order the venue"
  for today, assigned to the owner and Ada; search "venue" finds it; When "Today" finds it;
  Status "Done" does not.
- [ ] **Step 2:** Run the suite as the template's README says → PASS (with the template's own tests).
- [ ] **Step 3:** Commit `Roux The Day: an e2e test for items`.

### Task 7: CI and wrap-up

**Files:** Modify `.github/workflows/ci.yml` (a `roux-the-day` job copied from `template`, with
`working-directory: examples/roux-the-day`, its `go-version-file`, and the cache keys including
its lockfile); `sonar-project.properties` if it lists source roots; `FINDINGS.md`.

- [ ] **Step 1:** Add the job; run roux's own `make check` and the roux-web gates (nothing else
  changed but `page`); `actionlint` if available.
- [ ] **Step 2:** Finish FINDINGS.md with an "Extract into roux" list (the paginator first).
- [ ] **Step 3:** Commit `Roux The Day: CI`, push main, watch CI.

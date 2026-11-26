# Lists: paged by the server, drawn as a DataTable

Every list a screen shows is a `cqrs.Query` over a `page.New` paginator, drawn as a `DataTable`
(or a `CardList` on phones) bound to the query's page. `feature.md` builds one (`labels`); this card
is the rules and names for the server side, the query's args, and the table.

## Rules

- Never page, sort or filter a list in the browser: the query pages it (`Paging: list.Config()`),
  and the `DataTable` writes `pageIndex`, `sortBy` and `sortDirection` to the paths its binding
  reads. Never hand-write a pager.
- A column's `sort` is one of the server's `Sort` values; a column without one is not sortable.
- Give each list a view with one row per record and every column it shows, sorts by or searches:
  joined and computed values sort and search like any column. The view also gives each column in
  the form the row answers: `to_char(day, 'YYYY-MM-DD')` for a date (`format: "date"`),
  `to_char(at_time, 'HH24:MI')` for a time of day (`format: "time"`).
- The row struct is the select list: a `db` tag on every field names its column (`db:"-"` leaves
  one out), a `json` tag its member in the contract. No scan function.
- The list's Go test runs `list.Check`, through an `export_test.go` (`var List = list`).
- SQL fragments in `page.New` and `page.Where` are string literals; values are always arguments
  (`?`). A variable or `fmt.Sprintf` result does not compile: `cannot use ... as page.sqlText
  value`. Write the SQL out; a choice between two fragments is two literals.
- A filter is an arg: a string field tagged `query:"name"`, with `oneof:"a,b"` when it is one of
  some words. An unknown parameter, or a value outside `oneof`, is a `400` on that parameter before
  `Run`; an empty value is no filter (`""`).
- The binding keeps the args in a `local` (`labelsArgs`) and reads each into the query: a change
  refetches, and any change but the page's sends the page back to 0.

## Steps: the list's test

The list of `feature.md`'s `labels`, checked against the database (every sort, both ways, with a
search), so a misspelled view, column, sort or search field fails the build.
`internal/labels/export_test.go`:

<!-- file: internal/labels/export_test.go -->
```go
package labels

// List is the labels list, for its test.
var List = list
```

and `internal/labels/list_test.go`:

<!-- file: internal/labels/list_test.go -->
```go
package labels_test

import (
	"context"
	"testing"

	"github.com/jwcarman/roux/rouxtest"

	"roux-app/internal/labels"
)

func TestTheListMatchesTheDatabase(t *testing.T) {
	a := rouxtest.New(t, "labels")
	a.Role("USER")
	a.Migrate(labels.Module{}.Migrations()...)
	if err := labels.List.Check(context.Background(), a.Pool); err != nil {
		t.Fatal(err)
	}
}
```

Wire: `pageIndex` (0-based), `pageSize` (≤ 100), `sortBy`, `sortDirection` (`ASC`/`DESC`),
`search`, then the args; answer `{ data, pagination: { pageIndex, pageSize, totalElementCount,
totalPageCount, hasNext, hasPrevious } }`. An unknown `sortBy` is a 400 on `sortBy` ("Must be one of
COLOUR, CREATED_BY, NAME").

## The table on the surface

```json
{
  "id": "table",
  "component": "DataTable",
  "rows": { "@path": "/items" },
  "pageIndex": { "@path": "/itemsArgs/pageIndex" },
  "sortBy": { "@path": "/itemsArgs/sortBy" },
  "sortDirection": { "@path": "/itemsArgs/sortDirection" },
  "emptyText": "No items yet",
  "columns": [
    { "header": "Day", "field": "day", "format": "date", "sort": "DAY" },
    { "header": "Title", "field": "title", "sort": "TITLE", "link": { "to": "/items/$itemId", "params": { "itemId": "id" } } },
    { "header": "Assigned to", "field": "assigneeNames", "format": "list" },
    { "header": "Status", "field": "status", "format": "badge", "tones": { "Done": "success" } }
  ]
}
```

- `format`: `text` (the default), `date` (`yyyy-mm-dd`), `time` (`HH:mm`), `money`
  (`{minorUnits, currency}`), `badge` (a short status word; `tones` colour it by value: `neutral`,
  `info`, `success`, `warning`, `danger`), `list` (strings joined with ", ").
- `link` makes a column's cells links to an app route; its `params` name row fields. The row must
  answer each (`id` above), and the generated types say so.
- Search: an `InputField` bound to `/<x>Args/search`, read into the query's `search` arg. A filter:
  a `SelectField` bound to `/<x>Args/<arg>`, its options' values spelled as the arg's `oneof`, an
  option `""` for "any".
- A count above the list is a `cqrs.Lookup` (one value, not paged) drawn as `Stat`s, with the same
  `DependsOn` as the list so a change refreshes both.

## Names

- Go, `page`: `page.New`, `page.ListConfig[S, T]` (`From`, `Sorts`, `DefaultSort`,
  `DefaultPageSize`, `MaxPageSize`, `Search`; `T` a struct with a `db` tag per field), `page.Term`,
  `page.By(...)` and `.NullsFirst()`, `page.Field`: `page.Contains`, `page.Prefix`, `page.Exact`;
  `page.Filter`: `page.Where(fragment, args...)`, `page.WhereIf(cond, fragment, args...)` (a slice is
  one argument: `assignee_ids && ?`); `list.Page(ctx, db, req, search, filters...)`,
  `list.Check(ctx, db)`, `list.Config()`; `page.Request`, `page.Page[T]`, `page.Slice(sorted, req)`,
  `page.Of(rows, req, total)`. `page.New` returns a `*page.Paginator[S, T]`; `page.Querier` is a
  pool or a transaction; `page.Direction` is `page.Asc` or `page.Desc`; `page.Pagination` is the
  answer's `pagination`; `page.DefaultMaxSize` (100) is the largest page unless `MaxPageSize` says
  otherwise; `page.MaxSearchLength` (200) and `page.MaxOffset` bound a request;
  `page.UnknownSortError` is what an unknown `sortBy` becomes, the `400` on `sortBy`.
- Go, `api`: `api.PageRequest(r, list.Config())`, `api.PageRequestUnsorted(r)`: what a query does
  with the page parameters; a hand-written handler (roux's own pages) calls them itself.

### The React implementations

roux-web's React list components are what the catalog's primitives and roux's built-in pages
(users, sign-in, appearance) are drawn with. A feature's screen does not use them: it is a surface.
They matter when adding a primitive (`surfaces.md`).

- `/paging`: `PageParams`, `PageDto`, `PaginationDto`, `SortDirection`, `PageQuery`, `pageQuery`,
  `TableSearch`, `tableSearchOf`, `enumSearchOf`, `idSearchOf`, `dateSearchOf`, `searchTermOf`,
  `pageParamsOf`, `nextPageIndex`, `rowRange`, `queryStringOf`,
  `fetchAllPages(fetcher, params?, { maxPages })` (pages of `MAX_PAGE_SIZE`, at most `MAX_PAGES`), `InfiniteList`
  (`InfiniteListProps`), `InfiniteSelect` (`InfiniteSelectProps`), `LoadMode`.
- `/table`: `QueryTable` (`QueryTableProps`), `SimpleQueryTable` (`SimpleQueryTableProps`),
  `DebouncedSearchInput` (`DebouncedSearchInputProps`), `FilterChips` (`FilterChipsProps`,
  `FilterOption`), `SearchInput` (`SearchInputProps`), `useDebounce(value, ms)`,
  `DEFAULT_PAGE_SIZE`, `PAGE_SIZES`, `TableParams`, `useQueryTable` (`UseQueryTableOptions`,
  `UseQueryTableResult`), `TanstackTable` (`TanstackTableProps`), `TableView` (`TableViewProps`),
  `TablePagination`, `TableStatus`, `TablePageSizeSelect` (`TablePageSizeSelectProps`),
  `createSelectColumn` (`SelectColumnOptions`).

## Other lists

- **Ordered (move up/down):** a `position` column with a `unique (position) deferrable initially
  deferred` constraint; `moveUp` and `moveDown` commands; past an end is `problem.Conflict`; the
  service swaps the two positions in one transaction; a removal renumbers 1..n.
- **A column only some callers see:** in `Run`, fill the field only when `caller.Has(permission)`
  (else `nil`, `null` in JSON), and refuse a filter or sort on it with `problem.Forbidden()` when
  they lack it. A surface cannot hide a column by permission this round: the column shows empty
  cells to those callers.
- **Sorted by something computed or joined:** a column of the list's view.
- Not this round: a picker (pick one of many), row selection, infinite scroll on a surface.

## Check

Go test: an unknown `sortBy` is 400 on `sortBy`, an unknown arg value 400 on its parameter, an
unknown parameter 400; search, filter and sort each return the right rows; `list.Check` passes.
Vitest: the query string the surface sends after a filter changes (`feature.md` step 10).

## Pitfalls

- `page.New` without `DefaultPageSize: 25`: the server's default differs from the table's.
- A `?` count in `page.Where` that differs from the arguments: it panics the first time it runs.
- `cannot use ... as page.sqlText value`: `From`, `page.By`, the search fields and `page.Where`
  take string literals only. Write the SQL out; a value goes in as an argument.
- A view changed with `create or replace` that drops or retypes a column: refused; `drop view` and
  `create view` in a new migration.
- A column's `field` the query's row lacks: the binding fails to compile (the generated types want
  the field). A `format` that doesn't fit the field compiles; the cell shows the raw value.
- A filter option spelled differently from the arg's `oneof`: choosing it is a `400`.

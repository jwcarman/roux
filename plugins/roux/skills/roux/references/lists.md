# Lists: paged by the server, and the other kinds

A short list is `SimpleQueryTable` (`feature.md` step 11). A long one is paged by the server and
shown with `QueryTable`, its state in the URL.

## Rules

- Never page, sort or filter a long list in the browser (it would fetch every row); never
  hand-write a pager or a "Showing x to y" line: `QueryTable` has them.
- The server's `Sort` constants = the browser's column ids (the table sends the column id as
  `sortBy`); a column the server can't sort has `enableSorting: false`, or clicking it asks for a
  sort the server refuses.
- Give each list a view with one row per record and every column it shows, sorts by or searches:
  joined and computed values sort and search like any column. The view also gives each column in
  the form the row answers: `to_char(day, 'YYYY-MM-DD')` for a date, `to_char(at_time, 'HH24:MI')`
  for a time of day.
- The row struct is the select list: a `db` tag on every field names its column (`db:"-"` leaves
  one out). No scan function.
- The list's Go test runs `list.Check`, through an `export_test.go` (`var List = list`).
- SQL fragments in `page.New` and `page.Where` are string literals; values are always arguments
  (`?`). A variable or `fmt.Sprintf` result does not compile: `cannot use ... as page.sqlText
  value`. Write the SQL out; a choice between two fragments is two literals.
- Refuse an unknown filter value (`400` on that parameter); never ignore it.
- The list's key and fetch live in the module as `pageQuery(...)`; the page passes it as `query`.
- Read URL state only through `tableSearchOf`, `enumSearchOf`, `idSearchOf`, `dateSearchOf`: they
  drop a hand-edited bad value instead of failing the page.
- Define columns at module scope (or `useMemo`): rebuilt columns remount a row's open dialog.

## Steps: a paged list

The example pages the `labels` of `feature.md` (a name and a colour, made by its steps); its short
`GET /api/labels` stays. Replace `label`/`labels` with the list's names and `roux-app` with the
app's module. The Go blocks below are built and tested by `check-recipe.sh`.

**Server** (package `github.com/jwcarman/roux/page`, and `api`). The view is a migration,
`internal/labels/migrations/002_label_list.sql`; it has one row per label and every column the list
shows, sorts by or searches, the joined `created_by_name` among them:

<!-- file: internal/labels/migrations/002_label_list.sql -->
```sql
create view label_list as
select l.id, l.name, l.colour, l.version,
       u.display_name as created_by_name
  from label l
  join roux_user u on u.id = l.created_by;
```

The list, a package variable, with its row, its filter and the service method, in
`internal/labels/list.go`:

<!-- file: internal/labels/list.go -->
```go
package labels

import (
	"context"
	"net/http"
	"slices"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/problem"
)

// Sort is how the list may be sorted: the sortBy values a client sends.
type Sort string

const (
	ByName      Sort = "NAME"
	ByColour    Sort = "COLOUR"
	ByCreatedBy Sort = "CREATED_BY"
)

var list = page.New(page.ListConfig[Sort, Row]{
	From: "label_list",
	Sorts: map[Sort][]page.Term{
		ByName:      {page.By("lower(name)")},
		ByColour:    {page.By("colour"), page.By("lower(name)")},
		ByCreatedBy: {page.By("lower(created_by_name)")},
	},
	DefaultSort:     ByName,
	DefaultPageSize: 25,
	Search:          []page.Field{page.Contains("name"), page.Contains("created_by_name")},
})

// Row is a label as the list shows it: each db tag is a column of the view.
type Row struct {
	ID            uuid.UUID `json:"id" db:"id"`
	Name          string    `json:"name" db:"name"`
	Colour        string    `json:"colour" db:"colour"`
	CreatedByName string    `json:"createdByName" db:"created_by_name"`
	Version       int64     `json:"version" db:"version"`
}

// Filter is what a request narrows the list by: Colour is empty when the request names none.
type Filter struct {
	Search, Colour string
}

// Page is a page of labels.
func (s Service) Page(ctx context.Context, req page.Request, f Filter) (page.Page[Row], error) {
	return list.Page(ctx, s.Pool, req, f.Search, page.WhereIf(f.Colour != "", "colour = ?", f.Colour))
}

// filterOf reads the filter from the query; a colour that is not one of Colours is a 400.
func filterOf(r *http.Request) (Filter, error) {
	q := r.URL.Query()
	f := Filter{Search: q.Get("search"), Colour: q.Get("colour")}
	if f.Colour != "" && !slices.Contains(Colours, f.Colour) {
		return Filter{}, problem.InvalidField("colour", problem.MustBeOneOf(Colours...))
	}
	return f, nil
}
```

The handler goes in `Register`, with the module's other routes (`handlers.go`):

<!-- fragment: list-handler -->
```go
k.Handle("GET "+BasePath+"/page", LabelsRead, func(w http.ResponseWriter, r *http.Request) error {
	req, err := api.PageRequest(r, list.Config())
	if err != nil {
		return err
	}
	f, err := filterOf(r)
	if err != nil {
		return err
	}
	out, err := svc.Page(r.Context(), req, f)
	if err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, out)
})
```

The list's test checks it against the database (every sort, both ways, with a search), so a
misspelled view, column, sort or search field fails the build. `internal/labels/export_test.go`:

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

func TestThePagedListSearchesFiltersAndRefusesWhatItDoesNotKnow(t *testing.T) {
	owner, _ := setup(t)
	owner.Post("/api/labels", map[string]any{"name": "Urgent", "colour": "red"}).Want(t, 201, "first")
	owner.Post("/api/labels", map[string]any{"name": "Waiting", "colour": "yellow"}).Want(t, 201, "second")

	got := owner.Get("/api/labels/page?colour=red").Want(t, 200, "filter").JSON(t)
	if rows := got["data"].([]any); len(rows) != 1 || rows[0].(map[string]any)["name"] != "Urgent" {
		t.Fatalf("filtered %v", got)
	}
	got = owner.Get("/api/labels/page?search=wait&sortBy=NAME&sortDirection=DESC").Want(t, 200, "search").JSON(t)
	if rows := got["data"].([]any); len(rows) != 1 || rows[0].(map[string]any)["name"] != "Waiting" {
		t.Fatalf("searched %v", got)
	}
	owner.Get("/api/labels/page?colour=mauve").Want(t, 400, "unknown colour")
	owner.Get("/api/labels/page?sortBy=NOPE").Want(t, 400, "unknown sort")
}
```

Wire: `pageIndex` (0-based), `pageSize` (≤ 100), `sortBy`, `sortDirection` (`ASC`/`DESC`); answer
`{ data, pagination: { pageIndex, pageSize, totalElementCount, totalPageCount, hasNext, hasPrevious } }`.
An unknown `sortBy` is a 400 on `sortBy` ("Must be one of COLOUR, CREATED_BY, NAME").

**Module** (`items.ts`): `ITEM_SORTS = ["DAY", "TITLE", "ASSIGNEE"] as const`,
`ITEM_STATUSES = ["open", "done"] as const`, the row interface (`ItemRow`), and

```ts
export function itemsPage(filters: ItemFilters) {
  return pageQuery(queryKeys.items.list(filters), (params, signal) => itemsApi.list({ ...params, ...filters }, signal));
}
```

with `list: (filters) => [...queryKeys.items.lists(), filters] as const` in `queryKeys`, and
`itemsApi.list = (params: PageParams & ItemFilters, signal?: AbortSignal) => getJson<PageDto<ItemRow>>("items", { params, signal })`.

**Page**: `QueryTable` with `aria-label`, `query={itemsPage({ search: search.search, status: search.status })}`,
`columns` (each sortable column `id: "DAY" satisfies ItemSort`), `initialSort={{ id: "DAY", desc: false }}`,
`params={search}`, `onParamsChange={(next) => navigate({ search: (prev) => ({ ...prev, ...next, sortBy: ITEM_SORTS.find((s) => s === next.sortBy) }) })}`,
`getRowId`, `emptyText`, `errorText`. Above it, `DebouncedSearchInput` (`label`, `term`,
`onSearchChange`; navigate with `replace: true`) and `FilterChips` (`label`, `options`, `value`,
`onChange`, and `allLabel` or `defaultValue`). A search or filter change sets `pageIndex: undefined`.

**Route** (`routes/_signedIn/items/index.tsx`):

```tsx
export const Route = createFileRoute("/_signedIn/items/")({
  beforeLoad: ({ context }) => requirePermission(context.me, ITEMS_READ),
  validateSearch: (raw: Record<string, unknown>): ItemsSearch => ({
    ...tableSearchOf(raw, ITEM_SORTS),
    status: enumSearchOf(raw.status, ITEM_STATUSES),
  }),
  search: { middlewares: [stripSearchParams(ITEMS_SEARCH_DEFAULTS)] },
  component: ItemsPage,
});
```

`ItemsSearch = TableSearch<ItemSort> & { status?: ItemStatus }`; the defaults object uses
`DEFAULT_PAGE_SIZE` (25) and `satisfies TableSearch<ItemSort>`.

## Names

- Go, `page`: `page.New`, `page.ListConfig[S, T]` (`From`, `Sorts`, `DefaultSort`,
  `DefaultPageSize`, `MaxPageSize`, `Search`; `T` a struct with a `db` tag per field), `page.Term`, `page.By(...)` and
  `.NullsFirst()`, `page.Field`: `page.Contains`, `page.Prefix`, `page.Exact`; `page.Filter`:
  `page.Where(fragment, args...)`, `page.WhereIf(cond, fragment, args...)` (a slice is one
  argument: `assignee_ids && ?`); `list.Page(ctx, db, req, search, filters...)`,
  `list.Check(ctx, db)`, `list.Config()`; `page.Request`, `page.Page[T]`, `page.Slice(sorted, req)`,
  `page.Of(rows, req, total)`. `page.New` returns a `*page.Paginator[S, T]`; `page.Querier` is a
  pool or a transaction; `page.Direction` is `page.Asc` or `page.Desc`; `page.Pagination` is the answer's `pagination`;
`page.DefaultMaxSize` (100) is the largest page unless `MaxPageSize` says otherwise; `page.MaxSearchLength` (200) and
  `page.MaxOffset` bound a request; `page.UnknownSortError` is what `api.PageRequest` turns into
  the `400` on `sortBy`.
- Go, `api`: `api.PageRequest(r, list.Config())`, `api.PageRequestUnsorted(r)` (a fixed order, such
  as a history).
- `/paging`: `PageParams`, `PageDto`, `PaginationDto`, `SortDirection`, `PageQuery`, `pageQuery`,
  `TableSearch`, `tableSearchOf`, `enumSearchOf`, `idSearchOf`, `dateSearchOf`, `searchTermOf`,
  `pageParamsOf`, `nextPageIndex`, `rowRange`, `queryStringOf` (a link's `?a=b`; strings and numbers
  only), `fetchAllPages(fetcher, params?, { maxPages })` (pages of `MAX_PAGE_SIZE`, at most
  `MAX_PAGES`), `InfiniteList`, `InfiniteSelect`, `LoadMode`.
- `/table`: `QueryTable` (`QueryTableProps`), `SimpleQueryTable` (`SimpleQueryTableProps`; column ids
  are accessor keys), `DebouncedSearchInput` (`DebouncedSearchInputProps`), `FilterChips`
  (`FilterChipsProps`, `FilterOption`), `SearchInput` (`SearchInputProps`, no debounce) with
  `useDebounce(value, ms)` for a browser filter, `DEFAULT_PAGE_SIZE`, `PAGE_SIZES`, `TableParams`.
- Own layout: `useQueryTable` (`UseQueryTableOptions`, `UseQueryTableResult`: `table`, `page`,
  `isLoading`, `isError`) with `TanstackTable` (`TanstackTableProps`), `TableView` (`TableViewProps`),
  `TablePagination`, `TableStatus`, `TablePageSizeSelect` (`TablePageSizeSelectProps`).
- Row selection: `createSelectColumn({ selected, onSelectedChange, keyOf, labelOf })`
  (`SelectColumnOptions`); `useMemo` the columns on `selected`.

## Other lists

- **Grows a page at a time:** `InfiniteList` (`InfiniteListProps`: `aria-label`, `query` from
  `pageQuery(...)`, `getItemKey`, `renderItem`, `loadMode` `"hybrid"`, `emptyText`, `errorText`). Key it under the parent's
  `detail(id)` so refreshing the parent refreshes it.
- **Pick one of many:** `InfiniteSelect` (`InfiniteSelectProps`: `label`, `value`, `onChange`,
  `query`, `getItemId`, `getItemLabel`, `initialItem`, `minSearchLength`). Not a form field: inside `form.AppField`
  wire `value={field.state.value || undefined}`, `onChange={(id) => field.handleChange(id ?? "")}`,
  `invalid={!field.state.meta.isValid}`; its message does not show.
- **Ordered (move up/down):** a `position` column with a `unique (position) deferrable initially
  deferred` constraint; `POST .../move-up` and `.../move-down` answer the whole list; past an end is
  `problem.Conflict`; the service swaps the two positions in one transaction; a removal renumbers
  1..n.
- **A column only some callers see:** `caller := authn.PrincipalFrom(r.Context())`; fill the field
  only when `caller.Has(permission)` (else `nil`, `null` in JSON), and refuse a filter or sort on it
  with `problem.Forbidden()` when they lack it. In the browser, hide the column the same way.
- **Sorted by something computed or joined:** a column of the list's view.

## Check

Go test: an unknown `sortBy` is 400 on `sortBy`, an unknown filter value 400 on its parameter;
search, filter and sort each return the right rows. Route test (`renderRoute`) for URL state.

## Pitfalls

- A key built in the page misses the `queryKeys` prefix: `meta.refreshes` stops refreshing it.
- `page.New` without `DefaultPageSize: 25`: the server's default differs from the browser's
  `DEFAULT_PAGE_SIZE`.
- A `?` count in `page.Where` that differs from the arguments: it panics the first time it runs.
- `cannot use ... as page.sqlText value`: `From`, `page.By`, the search fields and
  `page.Where` take string literals only, never a variable or `fmt.Sprintf`. Write the SQL out; a
  value goes in as an argument, a choice between two fragments is two literals.
- A view changed with `create or replace` that drops or retypes a column: refused; `drop view` and
  `create view` in a new migration.
- A selection outlives a filter change; clear it in the page.

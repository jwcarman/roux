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
  joined and computed values sort and search like any column.
- SQL fragments in `page.New` and `page.Where` are constants; values are always arguments (`?`).
  The fragment types are unexported, so a string built at run time does not compile.
- Refuse an unknown filter value (`400` on that parameter); never ignore it.
- The list's key and fetch live in the module as `pageQuery(...)`; the page passes it as `query`.
- Read URL state only through `tableSearchOf`, `enumSearchOf`, `idSearchOf`, `dateSearchOf`: they
  drop a hand-edited bad value instead of failing the page.
- Define columns at module scope (or `useMemo`): rebuilt columns remount a row's open dialog.

## Steps: a paged list

**Server** (package `github.com/jwcarman/roux/page`, and `api`). The view is a migration:

```sql
create view item_list as
select i.id, i.title, i.notes, i.day, i.at_time, i.done, i.version,
       coalesce(a.names, '{}') as assignee_names,
       a.names[1]              as first_assignee_name
  from item i
  left join lateral (
        select array_agg(u.display_name order by lower(u.display_name), u.id) as names
          from item_assignee ia join roux_user u on u.id = ia.user_id
         where ia.item_id = i.id) a on true;
```

The list, a package variable:

```go
// Sort is how the list may be sorted: the sortBy values a client sends.
type Sort string

const (
	ByDay      Sort = "DAY"
	ByTitle    Sort = "TITLE"
	ByAssignee Sort = "ASSIGNEE"
)

var list = page.New(page.ListConfig[Sort, Row]{
	From:    "item_list",
	Columns: "id, title, day, done, assignee_names, version",
	Sorts: map[Sort][]page.Term{
		ByDay:      {page.By("day"), page.By("at_time").NullsFirst()},
		ByTitle:    {page.By("lower(title)")},
		ByAssignee: {page.By("lower(first_assignee_name)")},
	},
	DefaultSort:     ByDay,
	DefaultPageSize: 25,
	Search:          []page.Field{page.Contains("title"), page.Contains("notes")},
	Scan:            scanRow,
})

// Row is an item as the list shows it.
type Row struct {
	ID            uuid.UUID `json:"id"`
	Title         string    `json:"title"`
	Day           string    `json:"day"` // 2026-11-24
	Done          bool      `json:"done"`
	AssigneeNames []string  `json:"assigneeNames"`
	Version       int64     `json:"version"`
}

func scanRow(row pgx.CollectableRow) (Row, error) {
	var r Row
	var day time.Time
	if err := row.Scan(&r.ID, &r.Title, &day, &r.Done, &r.AssigneeNames, &r.Version); err != nil {
		return r, err
	}
	r.Day = day.Format(time.DateOnly)
	return r, nil
}

// List is a page of items. f.Done is a *bool: nil when the request asks for neither.
func (s Service) List(ctx context.Context, req page.Request, f Filter) (page.Page[Row], error) {
	return list.Page(ctx, s.Pool, req, f.Search, page.WhereIf(f.Done != nil, "done = ?", f.Done))
}
```

The handler, and the filter it reads:

```go
k.Handle("GET "+BasePath, ItemsRead, func(w http.ResponseWriter, r *http.Request) error {
	req, err := api.PageRequest(r, list.Config())
	if err != nil {
		return err
	}
	f, err := filterOf(r)
	if err != nil {
		return err
	}
	out, err := svc.List(r.Context(), req, f)
	if err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, out)
})
```

```go
func filterOf(r *http.Request) (Filter, error) {
	q := r.URL.Query()
	f := Filter{Search: q.Get("search")}
	switch q.Get("status") {
	case "":
	case "open":
		f.Done = new(false) // a *bool (Go 1.26's new takes a value)
	case "done":
		f.Done = new(true)
	default:
		return Filter{}, problem.InvalidField("status", problem.MustBeOneOf("open", "done"))
	}
	return f, nil
}
```

The module's `Start(ctx, k) error` runs `list.Check(ctx, k.Pool)`: every sort, both ways, with a
search, so a misspelled column stops startup instead of a request; and a `Scan` that reads a
different number of values than `Columns` lists. Two columns of one type read in the wrong order
it cannot see: the list's Go test reads a row and checks each field.

Wire: `pageIndex` (0-based), `pageSize` (≤ 100), `sortBy`, `sortDirection` (`ASC`/`DESC`); answer
`{ data, pagination: { pageIndex, pageSize, totalElementCount, totalPageCount, hasNext, hasPrevious } }`.
An unknown `sortBy` is a 400 on `sortBy` ("Must be one of ASSIGNEE, DAY, TITLE").

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

- Go, `page`: `page.New`, `page.ListConfig[S, T]` (`From`, `Columns`, `Sorts`, `DefaultSort`,
  `DefaultPageSize`, `MaxPageSize`, `Search`, `Scan`), `page.Term`, `page.By(...)` and
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
- `cannot use ... as page.sqlText value`: `From`, `Columns`, `page.By`, the search fields and
  `page.Where` take string literals only, never a variable or `fmt.Sprintf`. Write the SQL out; a
  value goes in as an argument, a choice between two fragments is two literals.
- A view changed with `create or replace` that drops or retypes a column: refused; `drop view` and
  `create view` in a new migration.
- A selection outlives a filter change; clear it in the page.

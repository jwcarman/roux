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
create view student_list as
select s.id, s.name, s.email, s.joined_on, s.status, r.name as rank_name
  from student s
  left join rank r on r.id = s.rank_id;
```

The list, a package variable:

```go
// Sort is how the list may be sorted: the sortBy values a client sends.
type Sort string

const (
	ByName     Sort = "NAME"
	ByJoinedOn Sort = "JOINED_ON"
)

var list = page.New(page.ListConfig[Sort, Row]{
	From:    "student_list",
	Columns: "id, name, email, joined_on, status",
	Sorts: map[Sort][]page.Term{
		ByName:     {page.By("lower(name)")},
		ByJoinedOn: {page.By("joined_on")},
	},
	DefaultSort:     ByName,
	DefaultPageSize: 25,
	Search:          []page.Field{page.Contains("name"), page.Contains("email")},
	Scan:            scanRow,
})

// Row is a student as the list shows them.
type Row struct {
	ID       uuid.UUID `json:"id"`
	Name     string    `json:"name"`
	Email    *string   `json:"email"`
	JoinedOn string    `json:"joinedOn"` // 2026-11-24
	Status   string    `json:"status"`
}

func scanRow(row pgx.CollectableRow) (Row, error) {
	var r Row
	var joined time.Time
	if err := row.Scan(&r.ID, &r.Name, &r.Email, &joined, &r.Status); err != nil {
		return r, err
	}
	r.JoinedOn = joined.Format(time.DateOnly)
	return r, nil
}

// List is a page of students.
func (s Service) List(ctx context.Context, req page.Request, f Filter) (page.Page[Row], error) {
	return list.Page(ctx, s.Pool, req, f.Search, page.WhereIf(f.Status != "", "status = ?", f.Status))
}
```

The handler, and the filter it reads:

```go
k.Handle("GET "+BasePath, StudentsRead, func(w http.ResponseWriter, r *http.Request) error {
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
	f := Filter{Search: q.Get("search"), Status: q.Get("status")}
	switch f.Status {
	case "", StatusActive, StatusInactive:
	default:
		return Filter{}, problem.InvalidField("status", problem.MustBeOneOf(StatusActive, StatusInactive))
	}
	return f, nil
}
```

The module's `Start(ctx, k) error` runs `list.Check(ctx, k.Pool)`: every sort, both ways, with a
search, so a misspelled column stops startup instead of a request.

Wire: `pageIndex` (0-based), `pageSize` (≤ 100), `sortBy`, `sortDirection` (`ASC`/`DESC`); answer
`{ data, pagination: { pageIndex, pageSize, totalElementCount, totalPageCount, hasNext, hasPrevious } }`.
An unknown `sortBy` is a 400 on `sortBy` ("Must be one of JOINED_ON, NAME").

**Module** (`students.ts`): `STUDENT_SORTS = ["NAME", "JOINED_ON"] as const`, the row interface, and

```ts
export function studentsPage(filters: StudentFilters) {
  return pageQuery(queryKeys.students.list(filters), (params, signal) =>
    studentsApi.list({ ...params, ...filters }, signal),
  );
}
```

with `list: (filters) => [...queryKeys.students.lists(), filters] as const` in `queryKeys`, and
`studentsApi.list = (params: PageParams & StudentFilters, signal?: AbortSignal) => getJson<PageDto<Student>>("students", { params, signal })`.

**Page**: `QueryTable` with `aria-label`, `query={studentsPage({ search: search.search, status: search.status })}`,
`columns` (each sortable column `id: "NAME" satisfies StudentSort`), `initialSort={{ id: "NAME", desc: false }}`,
`params={search}`, `onParamsChange={(next) => navigate({ search: (prev) => ({ ...prev, ...next, sortBy: STUDENT_SORTS.find((s) => s === next.sortBy) }) })}`,
`getRowId`, `emptyText`, `errorText`. Above it, `DebouncedSearchInput` (`label`, `term`,
`onSearchChange`; navigate with `replace: true`) and `FilterChips` (`label`, `options`, `value`,
`onChange`, and `allLabel` or `defaultValue`). A search or filter change sets `pageIndex: undefined`.

**Route** (`routes/_signedIn/students/index.tsx`):

```tsx
export const Route = createFileRoute("/_signedIn/students/")({
  validateSearch: (raw: Record<string, unknown>): StudentsSearch => ({
    ...tableSearchOf(raw, STUDENT_SORTS),
    status: enumSearchOf(raw.status, STUDENT_STATUSES),
  }),
  search: { middlewares: [stripSearchParams(STUDENTS_SEARCH_DEFAULTS)] },
  component: StudentsPage,
});
```

`StudentsSearch = TableSearch<StudentSort> & { status?: StudentStatus }`; the defaults object uses
`DEFAULT_PAGE_SIZE` (25) and `satisfies TableSearch<StudentSort>`.

## Names

- Go, `page`: `page.New`, `page.ListConfig[S, T]` (`From`, `Columns`, `Sorts`, `DefaultSort`,
  `DefaultPageSize`, `MaxPageSize`, `Search`, `Scan`), `page.Term`, `page.By(...)` and
  `.NullsFirst()`, `page.Field`: `page.Contains`, `page.Prefix`, `page.Exact`; `page.Filter`:
  `page.Where(fragment, args...)`, `page.WhereIf(cond, fragment, args...)` (a slice is one
  argument: `rank_id = any(?)`); `list.Page(ctx, db, req, search, filters...)`,
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
- A view changed with `create or replace` that drops or retypes a column: refused; `drop view` and
  `create view` in a new migration.
- A selection outlives a filter change; clear it in the page.

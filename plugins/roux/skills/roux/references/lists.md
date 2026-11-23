# Lists: paged by the server, and the other kinds

A short list is `SimpleQueryTable` (`feature.md` step 9). A long one is paged by the server and
shown with `QueryTable`, its state in the URL.

## Rules

- Never page, sort or filter a long list in the browser; never hand-write a pager or a "Showing x to
  y" line.
- Sort enum constant names = column ids; a column the server can't sort has `enableSorting: false`.
- The list's key and fetch live in the module as `pageQuery(...)`; the page passes it as `query`.
- Read URL state only through `tableSearchOf`, `enumSearchOf`, `idSearchOf`, `dateSearchOf`.
- Define columns at module scope (or `useMemo`): rebuilt columns remount a row's open dialog.

## Steps: a paged list

**Server** (jpa-utils, in the starter):

```java
public enum StudentSort implements SortPropertyProvider { // org.jwcarman.jpa.pagination
  NAME("name"), JOINED_ON("joinedOn");
  private final String property;
  StudentSort(String property) { this.property = property; }
  @Override public String getSortProperty() { return property; }
}

public interface StudentRepository extends SearchableRepository<StudentEntity, UUID> {} // org.jwcarman.jpa.spring.search
// entity: @Searchable (org.jwcarman.jpa.search.Searchable) on each text field a search looks in

private static final Paginator PAGES = Paginator.of(StudentEntity.class, StudentSort.class,
    cfg -> cfg.defaultSort(StudentSort.NAME).defaultPageSize(25)); // org.jwcarman.jpa.spring.page

@Transactional(readOnly = true)
public PageDto<Student> list(PageSpec spec, String search, StudentStatus status) {
  Specification<StudentEntity> where = students.searchFor(search);
  if (status != null) where = where.and((s, q, cb) -> cb.equal(s.get("status"), status));
  return PAGES.paginate(spec, pageable -> students.findAll(where, pageable), Student::of);
}

@GetMapping
@RequiresPermission(Permissions.STUDENTS_READ)
public PageDto<Student> list(@ModelAttribute PageParams params, // org.jwcarman.jpa.spring.web
    @RequestParam(required = false) String search, @RequestParam(required = false) StudentStatus status) {
  return students.list(params, search, status);
}
```

Wire: `pageIndex` (0-based), `pageSize` (≤ 100), `sortBy`, `sortDirection` (`ASC`/`DESC`); answer
`{ data, pagination: { pageIndex, pageSize, totalElementCount, totalPageCount, hasNext, hasPrevious } }`.
An unknown `sortBy` is a 400 on `sortBy`.

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
- **Ordered (move up/down):** a `position` column with a deferrable unique constraint; `POST
  .../move-up` and `.../move-down` answer the whole list; past an end is a `ConflictException`; the
  service swaps positions and `flush`es; a removal renumbers 1..n.
- **A column only some callers see:** inject `CallerPermissions`; `caller.has(permission)` to fill
  the fields (else `null`), `caller.require(permission, "Filtering or sorting by payment")` (403)
  when they filter or sort on it.
- **Sorted by something computed or joined:** a database view mapped by a read-only `@Immutable`
  entity extending `BaseEntity`. `saveAndFlush` before reading the view in the same transaction;
  cast view columns to the entity's types (`r.name::varchar`).

## Check

Controller test: an unknown `sortBy` is 400 on `sortBy`; search, filter and sort each return the
right rows. Route test (`renderRoute`) for URL state.

## Pitfalls

- A key built in the page misses the `queryKeys` prefix: `meta.refreshes` stops refreshing it.
- `Paginator` without `defaultPageSize(25)` pages by 20 while the browser asks for 25.
- A selection outlives a filter change; clear it in the page.

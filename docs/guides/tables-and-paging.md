# Tables and paging

A roux list is paged by the server. **An app's list is a `cqrs.Query`** over a `page.New` paginator
([Queries and commands](cqrs.md)), **drawn as a `DataTable` on a surface** ([Surfaces](surfaces.md)):
the table writes the page, the sort and the filters to paths its binding reads, and the query
answers one page of rows and where it sits in the whole. A feature writes no table code.

This guide is the server side every list shares (the wire, the view, `page.New`, its sorts, search
and filters, the query), then the React layer underneath the catalog: `@jwcarman/roux-web/table`
(`QueryTable`, search inputs, filter chips) and `@jwcarman/roux-web/paging` (the page types, a list
that grows a page at a time, a picker over a long list, URL state). The catalog's `DataTable` and
roux's built-in pages are built on that layer; it is what a person reads when
[adding a primitive](adding-a-primitive.md) or changing one of roux's own pages.

A list that grows as the app is used (tasks, entries, payments, events, anything with a date) is
paged, even while it is short: done and past rows pile up.

## The wire

A paged endpoint reads these query parameters, all optional (`contracts/page-params.json`):

| Parameter | Meaning | When absent |
| --- | --- | --- |
| `pageIndex` | The page, counting from 0. | 0 |
| `pageSize` | Rows per page; kept between 1 and the list's maximum (100 unless configured). | the list's default (20 unless configured) |
| `sortBy` | One of the list's sorts (`DAY`, `TITLE`): the constants of its sort type on the server. | the list's default sort |
| `sortDirection` | `ASC` or `DESC` (any case). | `ASC` |

and answers (`contracts/page.json`):

```json
{
  "data": [
    { "id": "1", "title": "Order the venue" },
    { "id": "2", "title": "Send the invitations" }
  ],
  "pagination": {
    "pageIndex": 0,
    "pageSize": 2,
    "totalElementCount": 3,
    "totalPageCount": 2,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

The same shapes in TypeScript, from `/paging` (`PageParams`, `PageDto`, `PaginationDto`,
`SortDirection`):

```ts
type SortDirection = "ASC" | "DESC";

interface PageParams {
  pageIndex?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: SortDirection;
  search?: string; // the search term most list endpoints also take
}

interface PageDto<T> {
  data: T[];
  pagination: PaginationDto;
}

interface PaginationDto {
  pageIndex: number;
  pageSize: number;
  totalElementCount: number;
  totalPageCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
```

Refusals are Problem Details ([Errors](errors.md)), all `400` with `errors` on the parameter:

- A `sortBy` that is not one of the list's sorts:

  ```json
  {
    "title": "Bad Request",
    "status": 400,
    "detail": "The request has invalid fields",
    "errors": [{ "field": "sortBy", "message": "Must be one of ASSIGNEE, DAY, TITLE" }],
    "instance": "/api/items"
  }
  ```

- A `sortDirection` other than `ASC` or `DESC`: an error on `sortDirection`.
- A `pageIndex` or `pageSize` that is not a number: an error on that field, `Invalid value`.

The browser never sends these if the table's column ids are the list's sort names and the URL is read
with `tableSearchOf` (below).

## The server

A list is declared once, as a package variable, with `page.New`; the query reads the page request
with its rules (`Paging: list.Config()`) and asks the list for a page. The paginator writes the count, the search,
the `ORDER BY` (with `id` last, so rows never move between pages), `LIMIT` and `OFFSET`; the app
writes the SQL particular to it: the view, and each filter.

### The view

Give each list a view shaped for it: one row per record, with every column the list shows, sorts
by or searches, and an `id`. Joined and computed values (a person's name, the first of several
assignees, a count) are columns of the view, so sorting and searching by them is no different
from any other column. A column the row answers in another form than the database keeps it is
the view's work too: a date as `2026-11-24` is `to_char(day, 'YYYY-MM-DD')`, a time of day as
`10:30` is `to_char(at_time, 'HH24:MI')`, beside the `date` and `time` columns the filters and
sorts use:

```sql
-- The items list reads this: the item, and its assignees' names, the first of them to sort by.
create view item_list as
select i.id, i.title, i.notes, i.day, i.at_time, i.done, i.version,
       coalesce(a.ids, '{}')   as assignee_ids,
       coalesce(a.names, '{}') as assignee_names,
       a.names[1]              as first_assignee_name,
       to_char(i.day, 'YYYY-MM-DD')  as day_text,
       to_char(i.at_time, 'HH24:MI') as at_text
  from item i
  left join lateral (
        select array_agg(u.id order by lower(u.display_name), u.id)           as ids,
               array_agg(u.display_name order by lower(u.display_name), u.id) as names
          from item_assignee ia
          join roux_user u on u.id = ia.user_id
         where ia.item_id = i.id) a on true;
```

A view is a migration like any table. `create or replace view` may add columns at the end but
cannot change or drop one; a changed view is `drop view` and `create view` in a new migration.

### The list

```go
// Sort is how the list may be sorted: the sortBy values a client sends.
type Sort string

const (
	ByDay      Sort = "DAY"
	ByTitle    Sort = "TITLE"
	ByAssignee Sort = "ASSIGNEE"
)

// list is the items list: item_list, by day unless asked otherwise.
var list = page.New(page.ListConfig[Sort, Row]{
	From: "item_list",
	Sorts: map[Sort][]page.Term{
		ByDay:      {page.By("day"), page.By("at_time").NullsFirst()},
		ByTitle:    {page.By("lower(title)")},
		ByAssignee: {page.By("lower(first_assignee_name)")},
	},
	DefaultSort:     ByDay,
	DefaultPageSize: 25,
	Search:          []page.Field{page.Contains("title"), page.Contains("notes")},
})

// Row is an item as the list shows it: each db tag names a column of the view.
type Row struct {
	ID            uuid.UUID `json:"id" db:"id"`
	Title         string    `json:"title" db:"title"`
	Day           string    `json:"day" db:"day_text"` // 2026-11-24
	At            *string   `json:"at" db:"at_text"`   // 10:30, or null for all day
	Done          bool      `json:"done" db:"done"`
	AssigneeNames []string  `json:"assigneeNames" db:"assignee_names"`
	Version       int64     `json:"version" db:"version"`
}
```

- **The row is the select list.** Each field's `db` tag names its column, and pgx fills the row by
  name, so there is no scan code to keep in step. `db:"-"` leaves a field out; an embedded struct
  contributes its own tagged fields. A field without a tag, or a tag that is not a plain column
  name, makes `page.New` panic, naming the field and the tag to write.

- **The sort type is a string type** whose constants are the `sortBy` values; each maps to the
  terms it orders by. The request's direction applies to every term; `NullsFirst()` puts rows with
  no value first (they come last otherwise, ascending): here an all-day item leads its day.
- **`DefaultPageSize: 25`** matches the browser's `DEFAULT_PAGE_SIZE` (without it, 20); the
  maximum is `page.DefaultMaxSize` (100) unless `MaxPageSize` says otherwise.
- `page.New` returns a `*page.Paginator`; its `Page` takes a `page.Querier` (the pool, or a
  transaction). The direction is `page.Asc` or `page.Desc` (a `page.Direction`); a request's offset
  stops at `page.MaxOffset`, and a search term at `page.MaxSearchLength` characters. The answer is
  a `page.Page[T]`: `data`, and `pagination` (a `page.Pagination`). An unknown sort is a
  `page.UnknownSortError`, which `api.PageRequest` answers as the `400` on `sortBy`.
- **Search fields** say how a word matches: `page.Contains(col)` anywhere in the column,
  `page.Prefix(col)` at its start (it can use an index on `lower(col) text_pattern_ops`), and
  `page.Exact(col)` the whole value, ignoring case. A search matches when every word of the term is
  in some field; a blank term matches everything, and one over 200 characters is a `400`.
- **`page.New` panics on a mistake in the declaration** (a default sort that is not a sort, an
  untagged row field), so it stops the program when the package loads.
- **Its test checks it.** The list's Go test runs `list.Check(ctx, pool)`, which runs the list's
  queries for every sort, both ways and with a search, matching nothing, so a misspelled view,
  column, sort or search field fails the build. A test in another package reaches the list
  through an `export_test.go` (`package items`, `var List = list`), Go's way of showing a test
  what the package keeps unexported:

  ```go
  func TestTheListMatchesTheDatabase(t *testing.T) {
  	f := setup(t)
  	if err := items.List.Check(context.Background(), f.Pool); err != nil {
  		t.Fatal(err)
  	}
  }
  ```
- **SQL is written as string literals.** `From`, `page.By`, the search fields and
  `page.Where` take only literals: a string variable or an `fmt.Sprintf` result does not compile
  (`cannot use ... as page.sqlText value`), so a value can never be pasted into SQL. Values go in as
  `page.Where`'s arguments; a choice between two fragments is two literals.

### The filters

```go
// List is a page of items.
func (s Service) List(ctx context.Context, req page.Request, f Filter) (page.Page[Row], error) {
	filters := []page.Filter{
		page.WhereIf(f.Done != nil, "done = ?", f.Done),
		page.WhereIf(f.From != nil, "day >= ?", f.From),
	}
	if f.Assignee != nil {
		filters = append(filters, page.Where("assignee_ids && ?", []uuid.UUID{*f.Assignee}))
	}
	return list.Page(ctx, s.Pool, req, f.Search, filters...)
}
```

- **`page.Where(fragment, args...)`** is one condition, with a `?` for each argument; the
  fragment is a constant and the values are always arguments. A slice is one argument: write
  `label_id = any(?)`, or `assignee_ids && ?` for an array column (above: any of the item's
  assignees is the one asked for).
- **`page.WhereIf(cond, ...)`** is the condition when `cond` holds and nothing otherwise, so a list
  of optional filters reads as a list. Its arguments are evaluated either way: pass a pointer as it
  is (pgx sends the value), and dereference one only behind an `if`, as the assignee is here.
- A `?` count that does not match the arguments panics the first time the line runs.

### The query

```go
cqrs.Query[ItemsArgs, ItemRow]{
	Name: "items", Permission: ItemsRead, DependsOn: []string{itemsChanged}, Paging: list.Config(),
	Run: func(ctx context.Context, db page.Querier, caller *authn.Principal, req page.Request, search string, args ItemsArgs) (page.Page[ItemRow], error) {
		return s.list(ctx, db, req, args.filter(caller, search))
	},
}
```

The query reads `pageIndex`, `pageSize`, `sortBy` and `sortDirection` with `list.Config()`, answering
a bad one with the `400` above, and its args (`query`-tagged string fields, `oneof` for a word from a
set) refuse a value they don't know as a `400` on that parameter, never ignoring it
([Queries and commands](cqrs.md#queries)). `Run` turns the args into the service's filter and asks for
the page; a mapping from the list's row to the type the screen shows goes there too.

A hand-written handler (one of roux's own pages, or an endpoint that is not a query) reads the same
request with `api.PageRequest(r, list.Config())`. A list whose order is fixed (a history, newest first) reads its request with
`api.PageRequestUnsorted(r)`, which ignores any `sortBy`. A list already in memory pages with
`page.Slice(sorted, req)`, and a page fetched some other way is wrapped with
`page.Of(rows, req, total)`.

## The React layer

Everything from here on is roux-web's React list layer, the one the catalog's `DataTable` and roux's
built-in pages are drawn with. A feature's screen is a surface and does not use it directly.

### The list's query

A table, a growing list or a select takes the list's query: `pageQuery(queryKey, fetch)`, the list's
key and how to fetch one page. Put it in the resource module, `src/items/items.ts`, beside
`itemsApi` ([API client](api-client.md#write-an-api-module-for-a-resource)), as a function of the
list's filters, with the list's row type, statuses and sorts (the module already imports
`queryKeys`):

```ts
/** The list's status filter: the server's `open` and `done`. */
export const ITEM_STATUSES = ["open", "done"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** The list's sorts: the column ids, and the server's `Sort` constants. */
export const ITEM_SORTS = ["DAY", "TITLE", "ASSIGNEE"] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

/** A row of the items list, as `/api/items` answers it. */
export interface ItemRow {
  id: string;
  title: string;
  day: string;
  at: string | null;
  done: boolean;
  assigneeNames: string[];
  version: number;
}

/** The items list under `filters`, as a QueryTable takes it: its key and how to fetch a page. */
export function itemsPage(filters: ItemFilters) {
  return pageQuery(queryKeys.items.list(filters), (params, signal) => itemsApi.list({ ...params, ...filters }, signal));
}
```

The filters go in the key and in the fetch, so a different search or status is a different list (and
starts on its first page). `fetch` receives the page, page size and sort, and the abort signal: pass
it on, so a page no longer needed is cancelled. The spread puts the filters after the table's
parameters. The component adds the page it asks for to the key (`[...queryKey, params]`), which is
why the key must come from `queryKeys`: a key outside its prefixes is not refreshed by a mutation's
`meta.refreshes`.

```ts
interface PageQuery<T> {
  queryKey: QueryKey;
  fetch: (params: PageParams, signal: AbortSignal) => Promise<PageDto<T>>;
}
function pageQuery<T>(queryKey: QueryKey, fetch: PageQuery<T>["fetch"]): PageQuery<T>;
```

Each component appends its own part to the key, so no two shapes of cached data collide: the table
adds the page request, `InfiniteSelect` its search and page size, and `InfiniteList` the word
`"infinite"` (an infinite query caches `{ pages, pageParams }`, not a plain list). All stay under the
module's key, so `meta.refreshes` reaches them.

The page never calls `itemsApi` or builds a key: it passes `query={itemsPage(filters)}`.

## A paged table

`QueryTable` is the whole thing: the rows, sortable headers, the pager, the row count and the page
size, placeholder rows while the first page loads, `emptyText` when there are no rows, and `errorText` above
the table when a page fails. It sits on the page without a box: small muted headings that stay in view
down a long list (from `md` up), an arrow only on the sorted column, and the row under the pointer
highlighted. The pager shows only when there is more than one page, and the page size only when a
smaller size would show fewer rows; on one page the count is just `7 rows`. The items page
(`src/items/ItemsPage.tsx`) keeps the page, sort, search and status filter in the URL, so a reload,
Back and a shared link keep them:

```tsx
import { Heading, Link, Stack } from "@chakra-ui/react";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { TableSearch } from "@jwcarman/roux-web/paging";
import { DEFAULT_PAGE_SIZE, DebouncedSearchInput, FilterChips, QueryTable } from "@jwcarman/roux-web/table";
import { ITEM_SORTS, itemsPage, type ItemRow, type ItemSort, type ItemStatus } from "./items";

/** The list's URL: page, sort and search, plus the status filter (all optional). */
export type ItemsSearch = TableSearch<ItemSort> & { status?: ItemStatus };

/** The list's defaults, left out of the URL. */
export const ITEMS_SEARCH_DEFAULTS = {
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  sortBy: "DAY",
  sortDirection: "ASC",
} as const satisfies TableSearch<ItemSort>;

const STATUS_CHIPS = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
] as const;

const column = createColumnHelper<ItemRow>();

/** Each sortable column's id is its sort's name; a column the server cannot sort says so. */
const COLUMNS: ColumnDef<ItemRow, unknown>[] = [
  column.accessor((item) => (item.at ? `${item.day} ${item.at}` : item.day), {
    id: "DAY" satisfies ItemSort,
    header: "When",
  }),
  column.accessor("title", {
    id: "TITLE" satisfies ItemSort,
    header: "Title",
    cell: (info) => (
      <Link asChild>
        <RouterLink to="/items/$itemId" params={{ itemId: info.row.original.id }}>
          {info.getValue()}
        </RouterLink>
      </Link>
    ),
  }),
  column.accessor((item) => item.assigneeNames.join(", "), {
    id: "ASSIGNEE" satisfies ItemSort,
    header: "Assigned to",
  }),
  column.accessor("done", {
    id: "STATUS",
    header: "Status",
    enableSorting: false,
    cell: (info) => (info.getValue() ? "Done" : "Open"),
  }),
];

const route = getRouteApi("/_signedIn/items/");

/** The team's items: paged, sortable, searchable, filtered by status, all kept in the URL. */
export function ItemsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();

  return (
    <Stack gap="6">
      <Heading as="h2">Items</Heading>
      <DebouncedSearchInput
        label="Search items"
        placeholder="Search titles and notes"
        term={search.search}
        // Typing replaces the history entry: Back skips the letters, not the searches.
        onSearchChange={(term) =>
          navigate({ search: (previous) => ({ ...previous, search: term, pageIndex: undefined }), replace: true })
        }
      />
      <FilterChips
        label="Status"
        options={STATUS_CHIPS}
        value={search.status}
        allLabel="Any status"
        onChange={(status) => navigate({ search: (previous) => ({ ...previous, status, pageIndex: undefined }) })}
      />
      <QueryTable
        aria-label="Items"
        query={itemsPage({ search: search.search, status: search.status })}
        columns={COLUMNS}
        initialSort={{ id: ITEMS_SEARCH_DEFAULTS.sortBy, desc: false }}
        params={search}
        onParamsChange={(next) =>
          navigate({
            search: (previous) => ({
              ...previous,
              ...next,
              sortBy: ITEM_SORTS.find((sort) => sort === next.sortBy),
            }),
          })
        }
        getRowId={(item) => item.id}
        emptyText="No items found."
        errorText="Could not load the items."
      />
    </Stack>
  );
}
```

The route (`src/routes/_signedIn/items/index.tsx`) reads the URL with `tableSearchOf` and
`enumSearchOf`, and leaves the defaults out of it:

```tsx
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { enumSearchOf, tableSearchOf } from "@jwcarman/roux-web/paging";
import { ITEM_SORTS, ITEM_STATUSES } from "../../../items/items";
import { ItemsPage, ITEMS_SEARCH_DEFAULTS, type ItemsSearch } from "../../../items/ItemsPage";

export const Route = createFileRoute("/_signedIn/items/")({
  validateSearch: (raw: Record<string, unknown>): ItemsSearch => ({
    ...tableSearchOf(raw, ITEM_SORTS),
    status: enumSearchOf(raw.status, ITEM_STATUSES),
  }),
  search: { middlewares: [stripSearchParams(ITEMS_SEARCH_DEFAULTS)] },
  component: ItemsPage,
});
```

How it fits together:

- **Column ids are sort names.** A column's `id` is what the table sends as `sortBy`, so it must be
  one of the list's sorts on the server (`satisfies ItemSort` makes the compiler check it). A
  column the server cannot sort sets `enableSorting: false`; an accessor column without it is
  sortable, and clicking it would ask for a sort the server refuses.
- **One sort at a time.** A sortable header is a button with `aria-sort`; the first click sorts
  ascending, the next descending. Changing the sort returns to the first page.
- **A filter change starts on page 1.** Uncontrolled, the table does it when the query's key changes.
  Controlled by `params` (as here), the page's `navigate` does it: set `pageIndex: undefined` in the
  same update that changes the search or a filter.
- **`params` and `onParamsChange`.** With `params` the table shows the page and sort it is given
  (defaults for what is absent) and reports each change as `TableParams`
  (`{ pageIndex, pageSize, sortBy?, sortDirection? }`) instead of keeping its own; `params.search` is
  ignored. `onParamsChange` gives `sortBy` as a `string`: narrow it back to the sort type with
  `ITEM_SORTS.find(...)` before it goes in the URL.
- **Typed URLs are checked.** `tableSearchOf(raw, sorts)` keeps a whole `pageIndex` (0 or more), a
  `pageSize` of at least 1 (capped at `MAX_PAGE_SIZE`, 100), a `sortBy` that is one of `sorts`, an
  `ASC`/`DESC` direction (any case), and a non-blank `search`; anything else is dropped.
  `enumSearchOf(raw, values)` keeps a filter value only if `values` offers it; for a filter whose
  values are ids loaded at run time (an assignee, a label), `idSearchOf(raw)` keeps a value only if it is
  shaped like a UUID, so the route never needs its own `typeof` check. A date that is URL state (a
  page for one day, a report's start) is `dateSearchOf(raw)`: a real `YYYY-MM-DD` (`2026-02-30` is
  not one) or absent; the page falls back to the organization's `today()` ([Dates and time](dates-and-time.md)). A typed URL past the
  last page moves to the last page. `validateSearch` returns every key, `undefined` for a bad
  value: the router lays its result over the raw URL parameters, so a key it leaves out passes the
  raw value through.
- **The previous page stays on screen** while the next one loads (TanStack's `keepPreviousData`).
- Without `params`, the table keeps its own page and sort, starting from `initialSort` and
  `initialPageSize` (`DEFAULT_PAGE_SIZE`, 25, unless given).

`QueryTableProps<T>`:

| Prop | Type | Meaning |
| --- | --- | --- |
| `query` | `PageQuery<T>` | The list's query from its module (`itemsPage(filters)`): its key, filters included, and how to fetch one page. |
| `columns` | `ColumnDef<T, unknown>[]` | TanStack Table columns; sortable ids are sort names. |
| `initialSort` | `ColumnSort` (`{ id, desc }`) | The sort when the URL or state has none. Give the server's default, so the header shows it. |
| `initialPageSize` | `number` | Rows per page when none is given; at most 100. |
| `getRowId` | `(row: T) => string` | A stable row id, such as the entity's id. |
| `params`, `onParamsChange` | `TableSearch`, `(params: TableParams) => void` | Keep the page and sort outside the table (the URL). |
| `pageSizes` | `number[]` | The page sizes offered (`PAGE_SIZES`, `[10, 25, 50, 100]`, by default; above 100 left out). |
| `emptyText` | `string` | Shown in place of rows when there are none (`No rows.`). |
| `errorText` | `string` | Shown above the table when a page cannot be loaded (`Could not load the rows.`). |
| anything else | Chakra `Table.Root` props | `aria-label` (always give one), `size`, `variant`, ... |

`TableSearch<S>` is the URL's shape: `{ pageIndex?, pageSize?, sortBy?: S, sortDirection?, search? }`.

## Search and filters

```ts
function DebouncedSearchInput(props: DebouncedSearchInputProps): JSX.Element;
// DebouncedSearchInputProps: label, placeholder?, width?, size?, plus
//   term?: string                                    the search in effect (from the URL)
//   onSearchChange: (term: string | undefined) => void
//   minLength?: number                               default 0
//   debounceMs?: number                              default 300

function FilterChips<T extends string>(props: FilterChipsProps<T>): JSX.Element;
// FilterChipsProps<T>: label, options: readonly FilterOption<T>[] ({ value, label }),
//   value: T | undefined, onChange: (value: T | undefined) => void,
//   allLabel?: string  |  defaultValue?: T   (one or the other, never both)
```

- `DebouncedSearchInput` (`DebouncedSearchInputProps`) reports the trimmed term once typing pauses (or at once when the field loses focus, so a link
  clicked mid-debounce navigates after it, not before), only when it changes, and
  `undefined` for a blank one. It follows `term` when the URL changes elsewhere (Back, a link)
  without reporting it back. Below `minLength` characters it searches for nothing and says `Type at
  least <n> characters to search`. Escape and its clear button empty it and report the search gone at once. Pass `replace: true` to the
  navigation so Back skips the keystrokes.
- `FilterChips` (`FilterChipsProps<T>`, options of `FilterOption<T>`) is one filter as a row of toggle buttons (`aria-pressed`), one chosen at a time;
  `allLabel` adds a first chip that clears it (`undefined`). `label` names the group for screen
  readers. When the list has its own default (a list that shows open items unless asked), pass `defaultValue` instead of `allLabel`: that chip shows chosen while `value` is
  `undefined`, and choosing it reports `undefined`, so the default stays out of the URL and the page
  needs no `value ?? DEFAULT` or `x === DEFAULT ? undefined : x` of its own. The two props exclude
  each other; with a default there is no "no filter" to offer.
- `SearchInput` (`SearchInputProps`: `value`, `onChange`, `label`, `placeholder?`, `width?`,
  `size?`) is the same field without the debounce, for a filter in the browser;
  `useDebounce(value, delayMs)` gives the value once it has stopped changing:

```tsx
import { List, Stack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SearchInput, useDebounce } from "@jwcarman/roux-web/table";
import { labelsQuery } from "./labels";

/** The labels whose name holds what was typed: a filter in the browser, no request per key. */
export function LabelFilter() {
  const [text, setText] = useState("");
  const term = useDebounce(text, 200).trim().toLowerCase();
  const labels = useQuery(labelsQuery);
  const shown = (labels.data ?? []).filter((label) => label.name.toLowerCase().includes(term));

  return (
    <Stack gap="2">
      <SearchInput label="Filter labels" placeholder="Filter by name" value={text} onChange={setText} />
      <List.Root>
        {shown.map((label) => (
          <List.Item key={label.id}>{label.name}</List.Item>
        ))}
      </List.Root>
    </Stack>
  );
}
```

`searchTermOf(text, minLength)` is the rule `DebouncedSearchInput` applies: the trimmed text, or
`undefined` when it is blank or shorter than `minLength`.

## A table with its own layout

`QueryTable` is `useQueryTable` plus `TableView`. To arrange the parts differently, call the hook and
place them yourself:

```tsx
import { Flex, Stack } from "@chakra-ui/react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { ErrorMessage } from "@jwcarman/roux-web/feedback";
import {
  TablePageSizeSelect,
  TablePagination,
  TableStatus,
  TanstackTable,
  useQueryTable,
} from "@jwcarman/roux-web/table";
import { itemsPage, type ItemRow } from "./items";

const column = createColumnHelper<ItemRow>();

const COLUMNS: ColumnDef<ItemRow, unknown>[] = [
  column.accessor("day", { id: "DAY", header: "Day" }),
  column.accessor("title", { id: "TITLE", header: "Title" }),
];

/** The open items, with the row count and page size above the table and the pager below. */
export function OpenItemsTable() {
  const { table, isLoading, isError } = useQueryTable({
    query: itemsPage({ status: "open" }),
    columns: COLUMNS,
    initialSort: { id: "DAY", desc: false },
    initialPageSize: 10,
    getRowId: (item) => item.id,
  });

  return (
    <Stack gap="2">
      <Flex justify="space-between" align="center">
        <TableStatus table={table} />
        <TablePageSizeSelect table={table} pageSizes={[10, 20, 50]} />
      </Flex>
      {isError && <ErrorMessage>Could not load the items.</ErrorMessage>}
      <TanstackTable
        aria-label="Open items"
        table={table}
        isLoading={isLoading}
        isError={isError}
        emptyText="Nothing open."
      />
      <TablePagination table={table} />
    </Stack>
  );
}
```

- `useQueryTable(options: UseQueryTableOptions<T>): UseQueryTableResult<T>`. The options are
  `QueryTable`'s first seven props (`query`, `columns`, `initialSort`, `initialPageSize`,
  `getRowId`, `params`, `onParamsChange`). The result is `{ table, page, isLoading, isError, refetch
  }`: the TanStack `table`, the `PageDto` on screen (the last one loaded while the next loads),
  `isLoading` while the first page loads, `isError` when a page failed.
- `TanstackTable` (`TanstackTableProps<T>`: `table`, `isLoading?`, `isError?`, `emptyText?`, and
  Chakra `Table.Root` props) draws the rows and the sortable headers; while it loads with no rows, three
  placeholder rows and a `status` named "Loading".
- `TableView` (`TableViewProps<T>`: `TanstackTable`'s props plus `pageSizes?` and `fixedPageSize?`) is `TanstackTable`
  with the pager (more than one page), the status and the page size (more rows than the smallest size)
  below it, shown once there are rows. `fixedPageSize` leaves the page size out, for rows whose page size
  the table cannot change.
- `TablePagination` (`{ table }`): first, previous, a page number field (`Page <n> of <count>`), next,
  last. A number typed past the end goes to the last page.
- `TableStatus` (`{ table }`, plus Chakra `Text` props): `Showing 26 to 50 of 60 rows` (`7 rows` on one page), announced
  politely as it changes. `rowRange(pagination, rowsOnPage)` gives its `{ first, last, total }`.
- `TablePageSizeSelect` (`TablePageSizeSelectProps<T>`: `table`, `pageSizes?`): rows per page, from
  `PAGE_SIZES` unless given; sizes above `MAX_PAGE_SIZE` are left out, and the current size is always
  offered.
- `pageParamsOf(pagination, sorting)` turns a table's state into the `PageParams` it requests: the
  first sorted column becomes `sortBy`.

## Choose rows

`createSelectColumn(options: SelectColumnOptions<T>): ColumnDef<T, unknown>` makes a checkbox column.
The selection is the page's state, kept by key, so it survives paging:

```tsx
import { Button, Stack } from "@chakra-ui/react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { createSelectColumn, QueryTable } from "@jwcarman/roux-web/table";
import { itemsPage, type ItemRow } from "./items";

const column = createColumnHelper<ItemRow>();

const COLUMNS: ColumnDef<ItemRow, unknown>[] = [
  column.accessor("day", { id: "DAY", header: "Day" }),
  column.accessor("title", { id: "TITLE", header: "Title" }),
];

/** Open items to choose and mark done together, across pages. */
export function ChooseItems({ onChosen }: { onChosen: (items: ItemRow[]) => void }) {
  const [selected, setSelected] = useState<Map<string, ItemRow>>(new Map());
  const columns = [
    createSelectColumn<ItemRow>({
      selected,
      onSelectedChange: setSelected,
      keyOf: (item) => item.id,
      labelOf: (item) => item.title,
    }),
    ...COLUMNS,
  ];

  return (
    <Stack gap="4">
      <QueryTable
        aria-label="Open items"
        query={itemsPage({ status: "open" })}
        columns={columns}
        initialSort={{ id: "DAY", desc: false }}
        getRowId={(item) => item.id}
      />
      <Button alignSelf="start" disabled={selected.size === 0} onClick={() => onChosen([...selected.values()])}>
        Mark {selected.size} done
      </Button>
    </Stack>
  );
}
```

`SelectColumnOptions<T>`: `selected` (a `ReadonlyMap` from key to row), `onSelectedChange` (a new
`Map`), `keyOf` (a stable key; rows are new objects on every fetch), `labelOf` (each checkbox is
labelled `Select <label>`), and `selectAllLabel` (the header checkbox, `Select every row on this page`
by default). The header checkbox selects or clears the rows on the page shown and leaves other pages'
selections alone; it is indeterminate when some are chosen. The column reads `selected`, so build the
columns with `useMemo` keyed on `selected`, not inline on every render (see below).

## A short list

A list that is never long (the team's labels) is fetched whole and sorted in the browser with
`SimpleQueryTable`: no pager, and no request to sort.

```tsx
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { SimpleQueryTable } from "@jwcarman/roux-web/table";
import { labelsQuery, type Label } from "./labels";

const column = createColumnHelper<Label>();

const COLUMNS: ColumnDef<Label, unknown>[] = [
  column.accessor("name", { header: "Name" }),
  column.accessor("colour", { header: "Colour" }),
];

/** Every label, sorted in the browser: a list this short needs no paging. */
export function LabelsTable() {
  return (
    <SimpleQueryTable
      aria-label="Labels"
      query={labelsQuery}
      columns={COLUMNS}
      initialSort={{ id: "name", desc: false }}
      getRowId={(label) => label.id}
      emptyText="No labels yet."
    />
  );
}
```

`SimpleQueryTableProps<T>`: `query` (the module's `queryOptions({ ... })` for the whole list, as
`labelsQuery` is in [Queries and mutations](queries-and-mutations.md)), `columns`, `initialSort?`,
`enabled?` (false holds the fetch, for example until a filter it needs is chosen), `getRowId?`,
`emptyText?`, `errorText?`, and Chakra `Table.Root` props. Its column ids are the accessor keys
(`name`), not sort names: the browser sorts.

To fetch every page of a paged endpoint (for a `SimpleQueryTable`, a dropdown or a mailing), use
`fetchAllPages`:

```ts
function fetchAllPages<T>(
  fetcher: (params: PageParams) => Promise<PageDto<T>>,
  params?: PageParams,
  options?: { maxPages?: number },
): Promise<T[]>;
```

```ts
import { fetchAllPages } from "@jwcarman/roux-web/paging";
import { itemsApi } from "./items";

/** Every open item, a page of 100 at a time, for a printed list. */
export function allOpenItems() {
  return fetchAllPages((params) => itemsApi.list({ ...params, status: "open" }));
}
```

It asks for pages of `MAX_PAGE_SIZE` (100) unless `params.pageSize` says otherwise, sends `params`'
other values with every request, and stops at the page without `hasNext`. Past `maxPages` (`MAX_PAGES`,
100, so 10,000 rows) it throws `fetchAllPages: the list has more than 100 pages`: a list that big
wants paging.

## An ordered list

A short list whose order is the point (the labels, in the order an item shows them) keeps a
`position` on each row, 1 to n, and moves a row one step at a time. The pieces:

- **The table.** `position` is unique, but a swap passes through a duplicate, so make the constraint
  deferrable: `alter table label add constraint label_position_key unique (position) deferrable
  initially deferred`. It is checked at commit.
- **One command per move.** `moveLabelUp` and `moveLabelDown` take the label's id and emit the
  list's event, so the list refetches. A move past either end is a `409`
  (`problem.Conflict("Urgent is already first")`), not a silent no-op.
- **The service swaps two positions** in one transaction, with the order locked:

```go
// slot is a label's place in the order.
type slot struct {
	ID       uuid.UUID `db:"id"`
	Name     string    `db:"name"`
	Position int       `db:"position"`
}

// move swaps a label with its neighbour: step is -1 (up) or 1 (down).
func (s Service) move(ctx context.Context, id uuid.UUID, step int) ([]Label, error) {
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select id, name, position from label order by position for update`)
		if err != nil {
			return err
		}
		order, err := pgx.CollectRows(rows, pgx.RowToStructByName[slot])
		if err != nil {
			return err
		}
		i := slices.IndexFunc(order, func(l slot) bool { return l.ID == id })
		if i < 0 {
			return notFound()
		}
		j := i + step
		if j < 0 || j >= len(order) {
			return problem.Conflict(fmt.Sprintf("%s is already at the end", order[i].Name))
		}
		_, err = tx.Exec(ctx, `update label set position = case id when $1 then $4 when $2 then $3 end
			where id in ($1, $2)`, order[i].ID, order[j].ID, order[i].Position, order[j].Position)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.List(ctx)
}
```

- **A new row goes to the end** (`coalesce(max(position), 0) + 1`, with the table locked), and **a
  removal closes the gap** in the same transaction: `update label set position = position - 1 where
  position > $1`.
- **The browser** has two mutations (`moveLabelUp`, `moveLabelDown`) that refresh the list (and any
  query that embeds a label, as the items' would). The row's buttons are disabled at the ends: take
  `first` and `last` from the table in the actions cell, `row.index === 0` and
  `row.index === table.getRowModel().rows.length - 1`, and give each `IconButton` an `aria-label` that
  names the row (`Move Urgent up`) and `loading` from its `useServerAction`.

```tsx
column.display({
  id: "actions",
  cell: ({ row, table }) => (
    <LabelActions label={row.original} first={row.index === 0} last={row.index === table.getRowModel().rows.length - 1} />
  ),
});
```

## A column only some people see

A list everyone with `items.read` may open can carry fields only some of them may see (an item's
cost needs `costs.read`). The query keeps its own permission; the column's is checked in its `Run`,
once, from the `caller` it is given:

```go
withCost := caller.Has(CostsRead)
if !withCost && (args.CostOver != "" || req.SortBy == string(ByCost)) {
	return page.Page[ItemRow]{}, problem.Forbidden()
}
return s.list(ctx, db, req, args.filter(caller, search), withCost) // the rows' cost, or null
```

- **Refuse the filter and the sort, don't ignore them.** A caller who filters on a field they cannot
  see learns its values from which rows come back.
- **Leave the fields `null` for such a caller**, not absent: the row's type stays one shape.
- A surface can't hide a column by permission yet ([Surfaces](surfaces.md#known-limits)): such a
  caller sees the column with empty cells. A React page (one of roux's own) hides the column, filter
  and sort from the same permission (`me.permissions.includes(COSTS_READ)`, from
  `permissions.gen.ts`); the server's check is the one that counts.

## A list that grows

`InfiniteList` shows a paged endpoint as a list that loads its next page on demand, newest first or
in whatever order the endpoint gives. An item's comments:

```tsx
import { Box, Text } from "@chakra-ui/react";
import { InfiniteList } from "@jwcarman/roux-web/paging";
import { commentsPage } from "./items";

/** An item's comments, newest first, a page at a time. */
export function Comments({ itemId }: { itemId: string }) {
  return (
    <InfiniteList
      aria-label="Comments"
      query={commentsPage(itemId)}
      getItemKey={(comment) => comment.id}
      loadMode="hybrid"
      emptyText="No comments yet."
      errorText="Could not load the comments."
      renderItem={(comment) => (
        <Box px="4" py="3">
          <Text>{comment.text}</Text>
          <Text fontSize="sm" color="fg.muted">
            {comment.authorName}, {comment.writtenOn}
          </Text>
        </Box>
      )}
    />
  );
}
```

with the query in the resource module, `src/items/items.ts`, and its key added to the factory in
`src/queryKeys.ts`, under the item, so refreshing `queryKeys.items.detail(id)` after a new comment
refreshes the list too:

```ts
/** A comment as `/api/items/{id}/comments` answers it, newest first. */
export interface Comment {
  id: string;
  text: string;
  authorName: string;
  writtenOn: string;
}

/** An item's comments: its key and how to fetch a page of them, 20 at a time. */
export function commentsPage(itemId: string) {
  return pageQuery(queryKeys.items.comments(itemId), ({ pageIndex }, signal) =>
    getJson<PageDto<Comment>>(path`items/${itemId}/comments`, {
      params: { pageIndex, pageSize: 20 },
      signal,
    }),
  );
}
```

```ts
comments: (id: string) => [...queryKeys.items.detail(id), "comments"] as const,
```

`InfiniteListProps<T>`:

| Prop | Meaning |
| --- | --- |
| `aria-label` | The list's name (required). |
| `query` | `PageQuery<T>`: the list's query from its module. The list passes `{ pageIndex }` and the signal to `fetch`; the page size is the endpoint's business. |
| `getItemKey`, `renderItem` | A stable key per item; what each item shows (`(item, index) => ReactNode`). |
| `loadMode` | `LoadMode`: `"manual"` (default: a `loadMoreText` button), `"auto"` (when the end scrolls within `threshold` pixels, default 100), `"hybrid"` (both). Where the browser cannot observe scrolling, the button shows in every mode. |
| `loadMoreText`, `emptyText`, `errorText` | `Load more`, `Nothing to show.`, `Could not load the list.` by default. |
| `containerProps` | Chakra `Box` props for the wrapper. |

It loads the first page at once, renders the items as a list (`ul`, each `li` bordered), and asks for
the next page while `pagination.hasNext` (`nextPageIndex(page)` gives the next index, or `undefined`
on the last page).

## Pick one from a long list

`InfiniteSelect` is a combobox over a paged endpoint: it searches the server as the user types and
loads more as the options scroll. It fetches nothing until it is opened.

```tsx
import { InfiniteSelect } from "@jwcarman/roux-web/paging";
import { itemsPage, type ItemRow } from "./items";

/** Picks one open item (the one this item waits on), searching the server as the user types. */
export function ItemPicker({
  itemId,
  onChange,
}: {
  itemId: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <InfiniteSelect<ItemRow>
      label="Waits on"
      value={itemId}
      onChange={onChange}
      query={itemsPage({ status: "open" })}
      getItemId={(item) => item.id}
      getItemLabel={(item) => item.title}
      getItemSubtext={(item) => item.day}
      placeholder="Search titles and notes"
      minSearchLength={2}
    />
  );
}
```

`InfiniteSelectProps<T>`:

| Prop | Meaning |
| --- | --- |
| `label` | The field's label. |
| `value`, `onChange` | The chosen item's id (controlled); `onChange(undefined)` when cleared. |
| `query` | `PageQuery<T>`: the options' query from its module. The select adds `{ search, pageSize }` to its key, and passes `{ search, pageIndex, pageSize }` and the signal to `fetch`. |
| `getItemId`, `getItemLabel`, `getItemSubtext?` | The item's id, its text, and a muted second line. |
| `initialItem` | The item `value` names, so the field can show its label before any page loads (an edit form's current choice). |
| `placeholder`, `minSearchLength` | Below `minSearchLength` characters (0 by default) it does not search and says `Type at least <n> characters to search`. |
| `required`, `invalid` | `required` drops the clear button; `invalid` marks the field. |
| `pageSize` | Options per page, 20 by default, at most 100. |

Typing is debounced (300 ms). `No items found` shows for an empty answer, and `Could not load the
options.` for a failed one.

## A link that exports the list

`queryStringOf(params)` is a query string for a plain link (`""` when there is nothing to send, else
`?a=b`): undefined and blank values are left out. Use it for a download whose URL carries the list's
search and filters:

```ts
import { queryStringOf } from "@jwcarman/roux-web/paging";
import type { ItemStatus } from "./items";

/** The CSV of the items the list shows (its search and status), every page of it. */
export function itemsExportHref(search: string | undefined, status: ItemStatus | undefined): string {
  return `/api/items/export.csv${queryStringOf({ search, status })}`;
}
```

## Things to know

- **Define columns once.** Module scope (one constant per permission: `COLUMNS`, `MANAGE_COLUMNS`) or
  `useMemo`. Columns rebuilt on every render make new cell components, which React remounts: a
  dialog opened from a cell closes by itself whenever the page re-renders (a query finishing is
  enough), and a test passes alone and fails after another. A column that must read state (the
  select column) is memoized on that state, and a cell that holds a dialog should not depend on it.

Gaps that a builder hits:

- **`InfiniteSelect` is not a form field.** It draws its own label and shows no error message. In a
  schema form, render it inside `form.AppField` and wire it by hand (`value={field.state.value ||
  undefined}`, `onChange={(id) => field.handleChange(id ?? "")}`, `invalid={!field.state.meta.isValid}`);
  the field's message does not appear under it. A `SelectField` over a short list has none of these
  limits ([Forms](forms.md#the-fields)).
- **`queryStringOf` takes strings and numbers only.** Unlike `getJson`'s `params`, it has no arrays and
  no booleans.
- **A selection outlives a filter change.** `createSelectColumn`'s `selected` is the page's state;
  rows filtered out of view stay selected until the page clears it.
- **`MAX_PAGE_SIZE` assumes the list's default maximum.** A server `MaxPageSize` below 100 is
  not known to the browser: the server answers smaller pages, and `TablePageSizeSelect` still offers
  the larger sizes.

## Don't

- Don't page, sort or filter a long list in the browser; page it on the server with `page.New`.
- Don't use sort names that differ from the column ids, or leave `enableSorting` on a
  column the server cannot sort.
- Don't read a table's state from the URL without `tableSearchOf`, `enumSearchOf`, `idSearchOf` and `dateSearchOf`.
- Don't build a list's key or call its API in the page; define its query in the module with
  `pageQuery` and pass it as `query`. A key built in the page can miss the `queryKeys` prefix, and
  `meta.refreshes` then stops refreshing the list.
- Don't build a page's query string by hand; pass the filters to the API function as `params`.
- Don't write a pager, a page-size select or a "Showing x to y" line; use the `/table` parts.

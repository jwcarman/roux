# Tables and paging

A roux list is paged by the server. The endpoint takes jpa-utils' page parameters (`pageIndex`,
`pageSize`, `sortBy`, `sortDirection`) plus its own filters, and answers a `PageDto`: one page of rows
and where it sits in the whole. In the browser, `@jwcarman/roux-web/table` draws a paged, sortable
table over such an endpoint (`QueryTable`), with search inputs and filter chips beside it, and
`@jwcarman/roux-web/paging` holds the page types, a list that grows a page at a time
(`InfiniteList`), a picker over a long list (`InfiniteSelect`), and the helpers that keep a table's
state in the URL. Queries and keys follow [Queries and mutations](queries-and-mutations.md).

## The wire

A paged endpoint reads these query parameters, all optional (`contracts/page-params.json`):

| Parameter | Meaning | When absent |
| --- | --- | --- |
| `pageIndex` | The page, counting from 0. | 0 |
| `pageSize` | Rows per page; kept between 1 and the paginator's maximum (100 unless configured). | the paginator's default (20 unless configured) |
| `sortBy` | The name of a constant of the endpoint's sort enum (`NAME`, `JOINED_ON`). | the paginator's default sort, if it has one |
| `sortDirection` | `ASC` or `DESC` (any case). | `ASC` |

and answers (`contracts/page.json`):

```json
{
  "data": [
    { "id": "1", "name": "Ada" },
    { "id": "2", "name": "Grace" }
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
  search?: string; // not jpa-utils': the search term most list endpoints also take
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

- A `sortBy` that is not one of the enum's constants (`contracts/problem-unknown-sort.json`):

  ```json
  {
    "title": "Bad Request",
    "status": 400,
    "detail": "The request has invalid fields",
    "errors": [{ "field": "sortBy", "message": "Unknown sort by value \"nope\", expecting one of id, name." }],
    "instance": "/api/contract/page"
  }
  ```

- A `sortDirection` other than `ASC` or `DESC`: an error on `sortDirection`.
- A `pageIndex` or `pageSize` that is not a number: an error on that field, `Invalid value`.

The browser never sends these if the table's column ids are the sort enum's names and the URL is read
with `tableSearchOf` (below).

## Write a paged endpoint

Three pieces on the server: a sort enum, a `Paginator` in the service, and `PageParams` in the
controller. jpa-utils comes with `roux-spring-boot-starter`.

The sort enum names what the list can be sorted by; each constant's name is a `sortBy` value and its
property is the entity's property to sort on:

```java
import org.jwcarman.jpa.pagination.SortPropertyProvider;

/** The student list's sorts, by column. */
public enum StudentSort implements SortPropertyProvider {
  NAME("name"),
  EMAIL("email"),
  JOINED_ON("joinedOn");

  private final String property;

  StudentSort(String property) {
    this.property = property;
  }

  @Override
  public String getSortProperty() {
    return property;
  }
}
```

The repository extends `SearchableRepository`, and the entity marks the fields a search looks in with
`@Searchable` (`org.jwcarman.jpa.search.Searchable`; text fields only):

```java
import java.util.UUID;

import org.jwcarman.jpa.spring.search.SearchableRepository;

public interface StudentRepository extends SearchableRepository<StudentEntity, UUID> {}
```

The service pages with one `Paginator` per list, and maps each entity to the list's row record:

```java
import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.spring.page.Paginator;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class StudentService {

  private static final Paginator PAGES =
      Paginator.of(
          StudentEntity.class,
          StudentSort.class,
          cfg -> cfg.defaultSort(StudentSort.NAME).defaultPageSize(25));

  private final StudentRepository students;

  public StudentService(StudentRepository students) {
    this.students = students;
  }

  /** One page of students matching {@code search} (name or email) and {@code status}. */
  @Transactional(readOnly = true)
  public PageDto<Student> list(PageSpec spec, String search, StudentStatus status) {
    Specification<StudentEntity> matching = students.searchFor(search);
    Specification<StudentEntity> filtered =
        status == null
            ? matching
            : matching.and((student, query, cb) -> cb.equal(student.get("status"), status));
    return PAGES.paginate(spec, pageable -> students.findAll(filtered, pageable), Student::of);
  }
}
```

```java
import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.spring.web.PageParams;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/students")
public class StudentsController {

  private final StudentService students;

  public StudentsController(StudentService students) {
    this.students = students;
  }

  @GetMapping
  public PageDto<Student> list(
      @ModelAttribute PageParams params,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) StudentStatus status) {
    return students.list(params, search, status);
  }
}
```

What the pieces do:

- `PageParams` (`org.jwcarman.jpa.spring.web.PageParams`) binds the four parameters; it is a
  `PageSpec`. Each filter is one more `@RequestParam` and one more `and(...)` on the specification.
- `Paginator.of(entity, sortEnum, cfg -> ...)` checks at startup that every sort property (and the
  `id` tiebreaker) is a property of the entity, and fails startup otherwise. `cfg` takes
  `defaultSort`, `defaultPageSize`, `maxPageSize`, `tiebreaker(...)`, `noTiebreaker()` and
  `skipPropertyValidation()`. Without a `defaultPageSize` the page size is 20; set it to 25 to match
  the browser's `DEFAULT_PAGE_SIZE`.
- `paginate(spec, query, mapper)` turns the request into a `Pageable` (an unknown `sortBy` throws
  `UnknownSortByValueException`, which roux answers with the 400 above), runs the query, and maps the
  page into a `PageDto`. Every sort ends with the tiebreaker, so paging is stable.
- `searchFor(term)` matches every word of the term, ignoring case, in at least one `@Searchable`
  field; a `null` or blank term matches everything.

## The list's query

A table, a growing list or a select takes the list's query: `pageQuery(queryKey, fetch)`, the list's
key and how to fetch one page. Put it in the resource module, `src/students/students.ts`, beside
`studentsApi` ([API client](api-client.md#write-an-api-module-for-a-resource)), as a function of the
list's filters, with the list's row type, statuses and sorts (the module already imports
`queryKeys`):

```ts
/** The statuses a student can have: the server's StudentStatus enum. */
export const STUDENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** The list's sorts: the column ids, and `StudentSort`'s values on the server. */
export const STUDENT_SORTS = ["NAME", "EMAIL", "JOINED_ON"] as const;
export type StudentSort = (typeof STUDENT_SORTS)[number];

/** A row of the student list, as `/api/students` answers it. */
export interface Student {
  id: string;
  name: string;
  email: string | null;
  joinedOn: string;
  status: StudentStatus;
}

/** The student list under `filters`, as a QueryTable takes it: its key and how to fetch a page. */
export function studentsPage(filters: StudentFilters) {
  return pageQuery(queryKeys.students.list(filters), (params, signal) =>
    studentsApi.list({ ...params, ...filters }, signal),
  );
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

The page never calls `studentsApi` or builds a key: it passes `query={studentsPage(filters)}`.

## A paged table

`QueryTable` is the whole thing: the rows, sortable headers, the pager, the row count and the page
size, a spinner while the first page loads, `emptyText` when there are no rows, and `errorText` above
the table when a page fails. The students page (`src/students/StudentsPage.tsx`) keeps the page, sort,
search and status filter in the URL, so a reload, Back and a shared link keep them:

```tsx
import { Heading, Link, Stack } from "@chakra-ui/react";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { TableSearch } from "@jwcarman/roux-web/paging";
import { DEFAULT_PAGE_SIZE, DebouncedSearchInput, FilterChips, QueryTable } from "@jwcarman/roux-web/table";
import { STUDENT_SORTS, studentsPage, type Student, type StudentSort, type StudentStatus } from "./students";

/** The list's URL: page, sort and search, plus the status filter (all optional). */
export type StudentsSearch = TableSearch<StudentSort> & { status?: StudentStatus };

/** The list's defaults, left out of the URL. */
export const STUDENTS_SEARCH_DEFAULTS = {
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  sortBy: "NAME",
  sortDirection: "ASC",
} as const satisfies TableSearch<StudentSort>;

const STATUS_CHIPS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

const column = createColumnHelper<Student>();

/** Each sortable column's id is its sort's name; a column the server cannot sort says so. */
const COLUMNS: ColumnDef<Student, unknown>[] = [
  column.accessor("name", {
    id: "NAME" satisfies StudentSort,
    header: "Name",
    cell: (info) => (
      <Link asChild>
        <RouterLink to="/students/$studentId" params={{ studentId: info.row.original.id }}>
          {info.getValue()}
        </RouterLink>
      </Link>
    ),
  }),
  column.accessor("email", {
    id: "EMAIL" satisfies StudentSort,
    header: "Email",
    cell: (info) => info.getValue() ?? "—",
  }),
  column.accessor("joinedOn", { id: "JOINED_ON" satisfies StudentSort, header: "Joined" }),
  column.accessor("status", {
    header: "Status",
    enableSorting: false,
    cell: (info) => (info.getValue() === "ACTIVE" ? "Active" : "Inactive"),
  }),
];

const route = getRouteApi("/_signedIn/students/");

/** The students: paged, sortable, searchable, filtered by status, all kept in the URL. */
export function StudentsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();

  return (
    <Stack gap="6">
      <Heading as="h2">Students</Heading>
      <DebouncedSearchInput
        label="Search students"
        placeholder="Search by name or email"
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
        allLabel="All statuses"
        onChange={(status) => navigate({ search: (previous) => ({ ...previous, status, pageIndex: undefined }) })}
      />
      <QueryTable
        aria-label="Students"
        query={studentsPage({ search: search.search, status: search.status })}
        columns={COLUMNS}
        initialSort={{ id: STUDENTS_SEARCH_DEFAULTS.sortBy, desc: false }}
        params={search}
        onParamsChange={(next) =>
          navigate({
            search: (previous) => ({
              ...previous,
              ...next,
              sortBy: STUDENT_SORTS.find((sort) => sort === next.sortBy),
            }),
          })
        }
        getRowId={(student) => student.id}
        emptyText="No students found."
        errorText="Could not load the students."
      />
    </Stack>
  );
}
```

The route (`src/routes/_signedIn/students/index.tsx`) reads the URL with `tableSearchOf` and
`enumSearchOf`, and leaves the defaults out of it:

```tsx
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { enumSearchOf, tableSearchOf } from "@jwcarman/roux-web/paging";
import { STUDENT_SORTS, STUDENT_STATUSES } from "../../../students/students";
import { StudentsPage, STUDENTS_SEARCH_DEFAULTS, type StudentsSearch } from "../../../students/StudentsPage";

export const Route = createFileRoute("/_signedIn/students/")({
  validateSearch: (raw: Record<string, unknown>): StudentsSearch => ({
    ...tableSearchOf(raw, STUDENT_SORTS),
    status: enumSearchOf(raw.status, STUDENT_STATUSES),
  }),
  search: { middlewares: [stripSearchParams(STUDENTS_SEARCH_DEFAULTS)] },
  component: StudentsPage,
});
```

How it fits together:

- **Column ids are sort names.** A column's `id` is what the table sends as `sortBy`, so it must be
  a constant of the endpoint's sort enum (`satisfies StudentSort` makes the compiler check it). A
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
  `STUDENT_SORTS.find(...)` before it goes in the URL.
- **Typed URLs are checked.** `tableSearchOf(raw, sorts)` keeps a whole `pageIndex` (0 or more), a
  `pageSize` of at least 1 (capped at `MAX_PAGE_SIZE`, 100), a `sortBy` that is one of `sorts`, an
  `ASC`/`DESC` direction (any case), and a non-blank `search`; anything else is dropped.
  `enumSearchOf(raw, values)` keeps a filter value only if `values` offers it; for a filter whose
  values are ids loaded at run time (a rank, a class), `idSearchOf(raw)` keeps a value only if it is
  shaped like a UUID, so the route never needs its own `typeof` check. A date that is URL state (a
  page for one day, a report's start) is `dateSearchOf(raw)`: a real `YYYY-MM-DD` (`2026-02-30` is
  not one) or absent; the page falls back to today with date-fns (`formatIsoDate(new Date())`). A typed URL past the
  last page moves to the last page.
- **The previous page stays on screen** while the next one loads (TanStack's `keepPreviousData`).
- Without `params`, the table keeps its own page and sort, starting from `initialSort` and
  `initialPageSize` (`DEFAULT_PAGE_SIZE`, 25, unless given).

`QueryTableProps<T>`:

| Prop | Type | Meaning |
| --- | --- | --- |
| `query` | `PageQuery<T>` | The list's query from its module (`studentsPage(filters)`): its key, filters included, and how to fetch one page. |
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
  readers. When the list has its own default (the school's students show the active ones unless
  asked), pass `defaultValue` instead of `allLabel`: that chip shows chosen while `value` is
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
import { ranksQuery } from "./ranks";

/** The ranks whose name holds what was typed: a filter in the browser, no request per key. */
export function RankFilter() {
  const [text, setText] = useState("");
  const term = useDebounce(text, 200).trim().toLowerCase();
  const ranks = useQuery(ranksQuery);
  const shown = (ranks.data ?? []).filter((rank) => rank.name.toLowerCase().includes(term));

  return (
    <Stack gap="2">
      <SearchInput label="Filter ranks" placeholder="Filter by name" value={text} onChange={setText} />
      <List.Root>
        {shown.map((rank) => (
          <List.Item key={rank.id}>{rank.name}</List.Item>
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
import { studentsPage, type Student } from "./students";

const column = createColumnHelper<Student>();

const COLUMNS: ColumnDef<Student, unknown>[] = [
  column.accessor("name", { id: "NAME", header: "Name" }),
  column.accessor("joinedOn", { id: "JOINED_ON", header: "Joined" }),
];

/** The active students, with the row count and page size above the table and the pager below. */
export function ActiveStudentsTable() {
  const { table, isLoading, isError } = useQueryTable({
    query: studentsPage({ status: "ACTIVE" }),
    columns: COLUMNS,
    initialSort: { id: "JOINED_ON", desc: true },
    initialPageSize: 10,
    getRowId: (student) => student.id,
  });

  return (
    <Stack gap="2">
      <Flex justify="space-between" align="center">
        <TableStatus table={table} />
        <TablePageSizeSelect table={table} pageSizes={[10, 20, 50]} />
      </Flex>
      {isError && <ErrorMessage>Could not load the students.</ErrorMessage>}
      <TanstackTable
        aria-label="Active students"
        table={table}
        isLoading={isLoading}
        isError={isError}
        emptyText="No active students."
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
  Chakra `Table.Root` props) draws the rows and the sortable headers.
- `TableView` (`TableViewProps<T>`: `TanstackTable`'s props plus `pageSizes?`) is `TanstackTable`
  with the pager, the status and the page size below it, shown once there are rows.
- `TablePagination` (`{ table }`): first, previous, a page number field (`Page <n> of <count>`), next,
  last. A number typed past the end goes to the last page.
- `TableStatus` (`{ table }`, plus Chakra `Text` props): `Showing 26 to 50 of 60 rows`, announced
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
import { studentsPage, type Student } from "./students";

const column = createColumnHelper<Student>();

const COLUMNS: ColumnDef<Student, unknown>[] = [
  column.accessor("name", { id: "NAME", header: "Name" }),
  column.accessor("email", { id: "EMAIL", header: "Email", cell: (info) => info.getValue() ?? "—" }),
];

/** Active students to choose for a grading, across pages. */
export function ChooseStudents({ onChosen }: { onChosen: (students: Student[]) => void }) {
  const [selected, setSelected] = useState<Map<string, Student>>(new Map());
  const columns = [
    createSelectColumn<Student>({
      selected,
      onSelectedChange: setSelected,
      keyOf: (student) => student.id,
      labelOf: (student) => student.name,
    }),
    ...COLUMNS,
  ];

  return (
    <Stack gap="4">
      <QueryTable
        aria-label="Active students"
        query={studentsPage({ status: "ACTIVE" })}
        columns={columns}
        initialSort={{ id: "NAME", desc: false }}
        getRowId={(student) => student.id}
      />
      <Button alignSelf="start" disabled={selected.size === 0} onClick={() => onChosen([...selected.values()])}>
        Add {selected.size} to the grading
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

A list that is never long (the school's ranks) is fetched whole and sorted in the browser with
`SimpleQueryTable`: no pager, and no request to sort.

```tsx
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { SimpleQueryTable } from "@jwcarman/roux-web/table";
import { ranksQuery, type Rank } from "./ranks";

const column = createColumnHelper<Rank>();

const COLUMNS: ColumnDef<Rank, unknown>[] = [
  column.accessor("name", { header: "Name" }),
  column.accessor("colour", { header: "Colour" }),
];

/** Every rank, sorted in the browser: a list this short needs no paging. */
export function RanksTable() {
  return (
    <SimpleQueryTable
      aria-label="Ranks"
      query={ranksQuery}
      columns={COLUMNS}
      initialSort={{ id: "name", desc: false }}
      getRowId={(rank) => rank.id}
      emptyText="No ranks yet."
    />
  );
}
```

`SimpleQueryTableProps<T>`: `query` (the module's `queryOptions({ ... })` for the whole list, as
`ranksQuery` is in [Queries and mutations](queries-and-mutations.md)), `columns`, `initialSort?`,
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
import { studentsApi } from "./students";

/** Every inactive student, a page of 100 at a time, for a mailing. */
export function allInactiveStudents() {
  return fetchAllPages((params) => studentsApi.list({ ...params, status: "INACTIVE" }));
}
```

It asks for pages of `MAX_PAGE_SIZE` (100) unless `params.pageSize` says otherwise, sends `params`'
other values with every request, and stops at the page without `hasNext`. Past `maxPages` (`MAX_PAGES`,
100, so 10,000 rows) it throws `fetchAllPages: the list has more than 100 pages`: a list that big
wants paging.

## An ordered list

A short list whose order is the point (the school's rank ladder) keeps a `position` on each row, 1 to
n, and moves a row one step at a time. The pieces, from the dojo's ranks:

- **The table.** `position` is unique, but a swap passes through a duplicate, so make the constraint
  deferrable: `alter table rank add constraint rank_position_key unique (position) deferrable
  initially deferred`. It is checked at commit.
- **One endpoint per move, answering the new list.** `POST /api/ranks/{id}/move-up` and
  `.../move-down` return the whole list (`List<Rank>`). A move past either end is a
  `ConflictException` (`Rank is already the lowest rank`), not a silent no-op.
- **The service swaps two positions and flushes**, in one transaction:

```java
private List<Rank> move(UUID id, int step, String refusal) {
  List<RankEntity> ladder = ranks.findAllByOrderByPositionAsc();
  RankEntity rank = find(id);
  int other = ladder.indexOf(rank) + step;
  if (other < 0 || other >= ladder.size()) {
    throw new ConflictException(refusal, rank.getName());
  }
  RankEntity neighbour = ladder.get(other);
  int position = rank.getPosition();
  rank.moveTo(neighbour.getPosition());
  neighbour.moveTo(position);
  ranks.flush();
  return list();
}
```

- **A new row goes to the end** (`maxPosition() + 1`), and **a removal closes the gap**: delete,
  `flush`, then renumber the rest 1..n by their order and `flush` again.
- **The browser** has two mutations (`moveRankUp`, `moveRankDown`) that refresh the list (and any
  query that embeds a rank, as the students' do). The row's buttons are disabled at the ends: take
  `first` and `last` from the table in the actions cell, `row.index === 0` and
  `row.index === table.getRowModel().rows.length - 1`, and give each `IconButton` an `aria-label` that
  names the row (`Move Blue up`) and `loading` from its `useServerAction`.

```tsx
column.display({
  id: "actions",
  cell: ({ row, table }) => (
    <RankActions rank={row.original} first={row.index === 0} last={row.index === table.getRowModel().rows.length - 1} />
  ),
});
```

## A list sorted or filtered by a computed value: a read-model view

A `Paginator` sorts by one property of the entity. To sort by something computed (last name then
first, lower-cased) or by something joined (a student's current rank), put it in a database view and
map a second, read-only entity over it (`@Entity @Immutable @Table(name = "student_list")`, extending
`BaseEntity`, so its id and version are the writable entity's). Change through the writable entity;
list and read through the view's. Two traps:

- **Flush before you read the view in the same transaction.** Hibernate flushes pending changes
  before a query only when the query touches a changed table, and a query over a view names none. A
  write that answers with the read model (`save`, then `detail(id)`) must `saveAndFlush` (or `flush`
  after `delete`) first, or the answer misses the row just saved or still shows the one just removed.
  Nothing fails at compile time.
- **The view's column types must be the types Hibernate's `validate` expects for the entity.** A
  joined `varchar(40)` is `varchar(40)` to the view but the entity maps plain `varchar`: cast it
  (`r.name::varchar`), and give a placeholder column its type (`null::uuid`). `create or replace
  view` cannot change a column's type, so a changed view is a drop and create (a new changeSet, never
  an edit of one that has run: its checksum would break existing databases), or `createView
  replaceIfExists="true"` when the columns keep their types.

A Paginator cannot put nulls last in a sort; the dojo rebuilds the `Pageable`'s `Sort` with
`Order::nullsLast` inside the query callback.

## A list that grows

`InfiniteList` shows a paged endpoint as a list that loads its next page on demand, newest first or
in whatever order the endpoint gives. A student's rank history:

```tsx
import { Box, Text } from "@chakra-ui/react";
import { InfiniteList } from "@jwcarman/roux-web/paging";
import { promotionsPage } from "./students";

/** A student's rank history, a page at a time. */
export function RankHistory({ studentId }: { studentId: string }) {
  return (
    <InfiniteList
      aria-label="Rank history"
      query={promotionsPage(studentId)}
      getItemKey={(promotion) => promotion.id}
      loadMode="hybrid"
      emptyText="No promotions yet."
      errorText="Could not load the rank history."
      renderItem={(promotion) => (
        <Box px="4" py="3">
          <Text>{promotion.rankName}</Text>
          <Text fontSize="sm" color="fg.muted">
            {promotion.promotedOn}
          </Text>
        </Box>
      )}
    />
  );
}
```

with the query in the resource module, `src/students/students.ts`, and its key added to the factory
in `src/queryKeys.ts`, under the student, so refreshing `queryKeys.students.detail(id)` after a
promotion refreshes the history too:

```ts
/** A promotion as `/api/students/{id}/promotions` answers it, newest first. */
export interface Promotion {
  id: string;
  rankName: string;
  promotedOn: string;
}

/** A student's rank history: its key and how to fetch a page of it, 20 promotions at a time. */
export function promotionsPage(studentId: string) {
  return pageQuery(queryKeys.students.promotions(studentId), ({ pageIndex }, signal) =>
    getJson<PageDto<Promotion>>(path`students/${studentId}/promotions`, {
      params: { pageIndex, pageSize: 20 },
      signal,
    }),
  );
}
```

```ts
promotions: (id: string) => [...queryKeys.students.detail(id), "promotions"] as const,
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
import { studentsPage, type Student } from "./students";

/** Picks one active student, searching the server as the user types. */
export function StudentPicker({
  studentId,
  onChange,
}: {
  studentId: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <InfiniteSelect<Student>
      label="Student"
      value={studentId}
      onChange={onChange}
      query={studentsPage({ status: "ACTIVE" })}
      getItemId={(student) => student.id}
      getItemLabel={(student) => student.name}
      getItemSubtext={(student) => student.email ?? ""}
      placeholder="Search by name or email"
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
import type { StudentStatus } from "./students";

/** The CSV of the students the list shows (its search and status), every page of it. */
export function studentsExportHref(search: string | undefined, status: StudentStatus | undefined): string {
  return `/api/students/export.csv${queryStringOf({ search, status })}`;
}
```

## Things to know

- **Define columns once.** Module scope (one constant per permission: `LADDER`, `MANAGE_COLUMNS`) or
  `useMemo`. Columns rebuilt on every render make new cell components, which React remounts: a
  dialog opened from a cell closes by itself whenever the page re-renders (a query finishing is
  enough), and a test passes alone and fails after another. A column that must read state (the
  select column) is memoized on that state, and a cell that holds a dialog should not depend on it.

Gaps in 0.2.0 that a builder hits:

- **`InfiniteSelect` is not a form field.** It draws its own label and shows no error message. In a
  schema form, render it inside `form.AppField` and wire it by hand (`value={field.state.value ||
  undefined}`, `onChange={(id) => field.handleChange(id ?? "")}`, `invalid={!field.state.meta.isValid}`);
  the field's message does not appear under it. A `SelectField` over a short list has none of these
  limits ([Forms](forms.md#the-fields)).
- **`queryStringOf` takes strings and numbers only.** Unlike `getJson`'s `params`, it has no arrays and
  no booleans.
- **A selection outlives a filter change.** `createSelectColumn`'s `selected` is the page's state;
  rows filtered out of view stay selected until the page clears it.
- **`MAX_PAGE_SIZE` assumes the paginator's default maximum.** A server `maxPageSize` below 100 is
  not known to the browser: the server answers smaller pages, and `TablePageSizeSelect` still offers
  the larger sizes.

## Don't

- Don't page, sort or filter a long list in the browser; page it on the server with a `Paginator`.
- Don't use sort enum constant names that differ from the column ids, or leave `enableSorting` on a
  column the server cannot sort.
- Don't read a table's state from the URL without `tableSearchOf`, `enumSearchOf`, `idSearchOf` and `dateSearchOf`.
- Don't build a list's key or call its API in the page; define its query in the module with
  `pageQuery` and pass it as `query`. A key built in the page can miss the `queryKeys` prefix, and
  `meta.refreshes` then stops refreshing the list.
- Don't build a page's query string by hand; pass the filters to the API function as `params`.
- Don't write a pager, a page-size select or a "Showing x to y" line; use the `/table` parts.

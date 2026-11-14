import { hashKey, keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";
import {
  functionalUpdate,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSort,
  type PaginationState,
  type SortingState,
  type Table,
  type Updater,
} from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import {
  MAX_PAGE_SIZE,
  pageParamsOf,
  type PageDto,
  type PageParams,
  type SortDirection,
  type TableSearch,
} from "../paging/paging";

export const DEFAULT_PAGE_SIZE = 25;

export interface UseQueryTableOptions<T> {
  /**
   * Names the list, including any search or filter the page applies (`query` closes over the
   * same values). A different key is a different list, which starts on its first page.
   */
  queryKey: QueryKey;
  /** Fetches one page; the table supplies the page, page size and sort. */
  query: (params: PageParams) => Promise<PageDto<T>>;
  /** Column ids of sortable columns are the endpoint's sort names (its sort enum's values). */
  columns: ColumnDef<T, unknown>[];
  initialSort?: ColumnSort;
  /** Rows per page, at most {@link MAX_PAGE_SIZE}; {@link DEFAULT_PAGE_SIZE} unless given. */
  initialPageSize?: number;
  /** A stable id per row, such as the entity's id; the row's index on the page otherwise. */
  getRowId?: (row: T) => string;
  /**
   * The page and sort, when the caller keeps them (in the URL, say): the table shows these, with
   * the defaults above for what is absent, and reports every change to {@link onParamsChange}
   * instead of keeping its own. Its `search` is ignored; put the search in `queryKey` and `query`,
   * and set `pageIndex` back to 0 in the same update that changes it.
   */
  params?: TableSearch;
  onParamsChange?: (params: TableParams) => void;
}

/** A table's page and sort, as reported to {@link UseQueryTableOptions.onParamsChange}. */
export interface TableParams {
  pageIndex: number;
  pageSize: number;
  sortBy?: string;
  sortDirection?: SortDirection;
}

export interface UseQueryTableResult<T> {
  table: Table<T>;
  /** The page on screen: the last one loaded, while the next one loads. */
  page: PageDto<T> | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

const NO_ROWS: never[] = [];

interface TableState {
  pagination: PaginationState;
  sorting: SortingState;
}

function stateOf(params: TableSearch, initialSort: ColumnSort | undefined, initialPageSize: number): TableState {
  return {
    pagination: {
      pageIndex: pageIndexOf(params.pageIndex ?? 0),
      pageSize: pageSizeOf(params.pageSize ?? initialPageSize),
    },
    sorting: sortingOf(params, initialSort),
  };
}

/**
 * The sort a URL asks for. A URL leaves out a default sortBy, so a direction may arrive alone: it
 * then applies to the initial sort's column.
 */
function sortingOf(params: TableSearch, initialSort: ColumnSort | undefined): SortingState {
  const sortBy = params.sortBy ?? initialSort?.id;
  if (sortBy === undefined) {
    return [];
  }
  const desc =
    params.sortDirection === undefined
      ? params.sortBy === undefined && (initialSort?.desc ?? false)
      : params.sortDirection === "DESC";
  return [{ id: sortBy, desc }];
}

function paramsOf({ pagination, sorting }: TableState): TableParams {
  const { pageIndex, pageSize } = pagination;
  const sort = sorting[0];
  return sort
    ? { pageIndex, pageSize, sortBy: sort.id, sortDirection: sort.desc ? "DESC" : "ASC" }
    : { pageIndex, pageSize };
}

function pageSizeOf(size: number): number {
  return Number.isFinite(size) ? Math.min(Math.max(1, Math.floor(size)), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
}

function pageIndexOf(index: number): number {
  return Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
}

/**
 * A TanStack table over a jpa-utils paged endpoint: the server pages and sorts, TanStack Query
 * fetches and caches, and the table holds the page and sort the user chose, or reports them to a
 * caller that keeps them ({@link UseQueryTableOptions.params}).
 */
export function useQueryTable<T>({
  queryKey,
  query,
  columns,
  initialSort,
  initialPageSize = DEFAULT_PAGE_SIZE,
  getRowId,
  params,
  onParamsChange,
}: UseQueryTableOptions<T>): UseQueryTableResult<T> {
  const controlled = params !== undefined;
  const [own, setOwn] = useState<TableState>(() => stateOf({}, initialSort, initialPageSize));
  const state = controlled ? stateOf(params, initialSort, initialPageSize) : own;

  const onParamsChangeRef = useRef(onParamsChange);
  useEffect(() => {
    onParamsChangeRef.current = onParamsChange;
  }, [onParamsChange]);

  function update(next: TableState) {
    const clean = {
      pagination: { pageIndex: pageIndexOf(next.pagination.pageIndex), pageSize: pageSizeOf(next.pagination.pageSize) },
      sorting: next.sorting,
    };
    if (controlled) {
      onParamsChangeRef.current?.(paramsOf(clean));
    } else {
      setOwn(clean);
    }
  }

  // A new key (another search or filter) starts on the first page. This is adjusted while
  // rendering, not in an effect, so the old page is never requested under the new key. A caller
  // keeping the params resets the page itself, in the same update that changes the key.
  const keyHash = hashKey(queryKey);
  const [listedKey, setListedKey] = useState(keyHash);
  let current = state.pagination;
  if (listedKey !== keyHash) {
    setListedKey(keyHash);
    if (!controlled && own.pagination.pageIndex !== 0) {
      current = { ...own.pagination, pageIndex: 0 };
      setOwn({ ...own, pagination: current });
    }
  }

  const request = pageParamsOf(current, state.sorting);
  const result = useQuery({
    queryKey: [...queryKey, request],
    queryFn: () => query(request),
    placeholderData: keepPreviousData,
  });
  const page = result.data;

  // Rows removed elsewhere, or a page typed into the URL, can leave the table past the last page:
  // move to the last one.
  const loadedPageCount = result.isPlaceholderData ? undefined : page?.pagination.totalPageCount;
  const pastTheEnd =
    loadedPageCount !== undefined && current.pageIndex > 0 && current.pageIndex >= loadedPageCount
      ? Math.max(0, loadedPageCount - 1)
      : undefined;
  const pageSize = current.pageSize;
  const sortBy = state.sorting[0]?.id;
  const sortDesc = state.sorting[0]?.desc ?? false;
  useEffect(() => {
    if (pastTheEnd === undefined) {
      return;
    }
    const last: TableState = {
      pagination: { pageIndex: pastTheEnd, pageSize },
      sorting: sortBy === undefined ? [] : [{ id: sortBy, desc: sortDesc }],
    };
    if (controlled) {
      onParamsChangeRef.current?.(paramsOf(last));
    } else {
      setOwn(last);
    }
  }, [pastTheEnd, controlled, pageSize, sortBy, sortDesc]);

  const table = useReactTable<T>({
    data: page?.data ?? NO_ROWS,
    columns,
    getRowId,
    rowCount: page?.pagination.totalElementCount ?? 0,
    pageCount: page?.pagination.totalPageCount ?? 0,
    state: { pagination: current, sorting: state.sorting },
    onPaginationChange: (updater: Updater<PaginationState>) =>
      update({ ...state, pagination: functionalUpdate(updater, current) }),
    onSortingChange: (updater: Updater<SortingState>) =>
      update({ sorting: functionalUpdate(updater, state.sorting), pagination: { ...current, pageIndex: 0 } }),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    autoResetPageIndex: false,
    enableMultiSort: false,
    enableSortingRemoval: false,
    // TanStack guesses a column's first direction from its first row, and with no rows yet it guesses
    // descending: a header clicked while the page loads would sort backwards. Always start ascending.
    sortDescFirst: false,
  });

  return { table, page, isLoading: result.isLoading, isError: result.isError, refetch: result.refetch };
}

/** How the client talks to jpa-utils' paged endpoints: `PageParams` in, `PageDto` out. */

import type { QueryKey } from "@tanstack/react-query";
import { parseIsoDate } from "../dates/dates";

export type SortDirection = "ASC" | "DESC";

/** jpa-utils' page of results: one page of `data` and where it sits in the whole. */
export interface PaginationDto {
  pageIndex: number;
  pageSize: number;
  totalElementCount: number;
  totalPageCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PageDto<T> {
  data: T[];
  pagination: PaginationDto;
}

/** What a paged list endpoint accepts (jpa-utils' PageParams, plus a search term). */
export interface PageParams {
  pageIndex?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: SortDirection;
  search?: string;
}

/** A paged list's query, as a resource module defines it: its key, and how to fetch one page. */
export interface PageQuery<T> {
  /** Names the list, filters included (a key from the app's `queryKeys`); the component appends the page it asks for. */
  queryKey: QueryKey;
  /** Fetches one page; the component supplies the page, size, sort or search, and the signal. */
  fetch: (params: PageParams, signal: AbortSignal) => Promise<PageDto<T>>;
}

/** A paged list's query: `pageQuery(queryKeys.students.list(filters), (params, signal) => studentsApi.list({ ...filters, ...params }, signal))`. */
export function pageQuery<T>(queryKey: QueryKey, fetch: PageQuery<T>["fetch"]): PageQuery<T> {
  return { queryKey, fetch };
}

/** The most rows a jpa-utils `Paginator` returns per page by default. */
export const MAX_PAGE_SIZE = 100;

/** The query string for `params`: `""` when there is nothing to send, else `"?a=b&c=d"`. */
export function queryStringOf(params: PageParams & Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim() !== "") {
      query.set(name, String(value));
    }
  }
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

/**
 * The request for a table's state. Column ids are the endpoint's sort names (its sort enum's
 * values), so the first sorted column becomes `sortBy`; with none, the server's default applies.
 */
export function pageParamsOf(
  pagination: { pageIndex: number; pageSize: number },
  sorting: readonly { id: string; desc: boolean }[],
): PageParams {
  const params: PageParams = { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize };
  const sort = sorting[0];
  if (sort) {
    params.sortBy = sort.id;
    params.sortDirection = sort.desc ? "DESC" : "ASC";
  }
  return params;
}

/** The term to search for: `text` trimmed, or absent while blank or shorter than `minLength`. */
export function searchTermOf(text: string, minLength: number): string | undefined {
  const term = text.trim();
  return term.length > 0 && term.length >= minLength ? term : undefined;
}

/** The index of the page after `page`, or absent on the last page. */
export function nextPageIndex(page: PageDto<unknown>): number | undefined {
  return page.pagination.hasNext ? page.pagination.pageIndex + 1 : undefined;
}

/** Which rows a page shows, counting from 1: "Showing `first` to `last` of `total`". */
export function rowRange(
  pagination: Pick<PaginationDto, "pageIndex" | "pageSize" | "totalElementCount">,
  rowsOnPage: number,
): { first: number; last: number; total: number } {
  if (rowsOnPage === 0) {
    return { first: 0, last: 0, total: pagination.totalElementCount };
  }
  const first = pagination.pageIndex * pagination.pageSize + 1;
  return { first, last: first + rowsOnPage - 1, total: pagination.totalElementCount };
}

/** How many pages {@link fetchAllPages} fetches before it gives up: 10,000 rows at 100 a page. */
export const MAX_PAGES = 100;

/**
 * Every row of a paged endpoint, fetched page by page, for a dropdown or an export that needs the
 * whole list. Pages are {@link MAX_PAGE_SIZE} rows unless `params` says otherwise; its other
 * parameters go with every request.
 *
 * @throws Error past `maxPages` pages ({@link MAX_PAGES} by default), or if the server answers
 *   with a page other than the one asked for: a list that big wants paging, not one fetch.
 */
export async function fetchAllPages<T>(
  fetcher: (params: PageParams) => Promise<PageDto<T>>,
  params: PageParams = {},
  { maxPages = MAX_PAGES }: { maxPages?: number } = {},
): Promise<T[]> {
  const rows: T[] = [];
  let pageIndex: number | undefined = params.pageIndex ?? 0;
  for (let fetched = 0; pageIndex !== undefined; fetched++) {
    if (fetched === maxPages) {
      throw new Error(`fetchAllPages: the list has more than ${maxPages} pages`);
    }
    const page = await fetcher({ ...params, pageIndex, pageSize: params.pageSize ?? MAX_PAGE_SIZE });
    if (page.pagination.pageIndex !== pageIndex) {
      throw new Error(`fetchAllPages: asked for page ${pageIndex}, got page ${page.pagination.pageIndex} again`);
    }
    rows.push(...page.data);
    pageIndex = nextPageIndex(page);
  }
  return rows;
}

/** A table's page, page size, sort and search, as kept in the URL; absent means the default. */
export interface TableSearch<S extends string = string> {
  pageIndex?: number;
  pageSize?: number;
  sortBy?: S;
  sortDirection?: SortDirection;
  search?: string;
}

function isWholeNumber(value: unknown): value is number {
  return Number.isInteger(value);
}

/** `value`, or the number its text spells, when that is a whole number of at least `min`. */
function wholeNumberOf(value: unknown, min: number): number | undefined {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return isWholeNumber(number) && number >= min ? number : undefined;
}

/**
 * A table's search params from a URL (a route's `validateSearch`). Anyone can type a URL, so
 * values are checked, not trusted: an unknown sort, a bad page or a blank search is dropped, and
 * the page size is capped at {@link MAX_PAGE_SIZE}.
 */
export function tableSearchOf<S extends string>(raw: Record<string, unknown>, sorts: readonly S[]): TableSearch<S> {
  const pageIndex = wholeNumberOf(raw.pageIndex, 0);
  const pageSize = wholeNumberOf(raw.pageSize, 1);
  const direction = typeof raw.sortDirection === "string" ? raw.sortDirection.toUpperCase() : undefined;
  // Every key is named, undefined when dropped: TanStack Router merges a route's search over its
  // parent's, which holds the raw values, so a key left out would let the raw value through.
  return {
    pageIndex,
    pageSize: pageSize === undefined ? undefined : Math.min(pageSize, MAX_PAGE_SIZE),
    sortBy: sorts.find((sort) => sort === raw.sortBy),
    sortDirection: direction === "ASC" || direction === "DESC" ? direction : undefined,
    search: typeof raw.search === "string" ? searchTermOf(raw.search, 0) : undefined,
  };
}

/**
 * A filter's value from a URL (a route's `validateSearch`): the value if `values` offers it, else
 * absent, so a typed or stale URL never sends the server a value it would refuse.
 */
export function enumSearchOf<T extends string>(raw: unknown, values: readonly T[]): T | undefined {
  return values.find((value) => value === raw);
}

const ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A filter's value from a URL when its values are ids loaded at run time (a route's
 * `validateSearch`): the value if it is shaped like a UUID, else absent, so a typed or stale URL
 * never sends the server an id it would refuse.
 */
export function idSearchOf(raw: unknown): string | undefined {
  return typeof raw === "string" && ID_SHAPE.test(raw) ? raw : undefined;
}

/**
 * A date in the URL (a route's `validateSearch`), for a page whose date is URL state: the value if it
 * is a real `YYYY-MM-DD` date (`2026-02-30` is not), else absent, so a typed or stale URL never
 * sends the server a date it would refuse.
 */
export function dateSearchOf(raw: unknown): string | undefined {
  return typeof raw === "string" && parseIsoDate(raw) !== undefined ? raw : undefined;
}

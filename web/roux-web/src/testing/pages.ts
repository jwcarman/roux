import type { PageDto, PageParams } from "../paging/paging";

/**
 * One page of `rows`, as a roux list endpoint answers `params`: the slice for `params.pageIndex`
 * (0 unless given) at `params.pageSize` (20 unless given), with the pagination block.
 *
 * ```ts
 * server.use(http.get("/api/students", () => HttpResponse.json(pageOf(students, { pageIndex: 1, pageSize: 2 }))));
 * ```
 */
export function pageOf<T>(rows: readonly T[], params: PageParams): PageDto<T> {
  const pageIndex = params.pageIndex ?? 0;
  const pageSize = params.pageSize ?? 20;
  const totalPageCount = Math.ceil(rows.length / pageSize);
  return {
    data: rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    pagination: {
      pageIndex,
      pageSize,
      totalElementCount: rows.length,
      totalPageCount,
      hasNext: pageIndex < totalPageCount - 1,
      hasPrevious: pageIndex > 0,
    },
  };
}

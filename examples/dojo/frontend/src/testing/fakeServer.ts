import type { PageDto, PageParams } from "@jwcarman/roux-web/paging";

export interface Person {
  id: string;
  name: string;
  email: string;
}

/** `count` people, `p1`..`pN`, named so that NAME and EMAIL sort them in opposite orders. */
export function people(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(3, "0");
    return { id: `p${i + 1}`, name: `Person ${n}`, email: `${String(999 - i).padStart(3, "0")}@example.com` };
  });
}

/** One page of `rows`, as a jpa-utils endpoint would answer `params`. */
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

/** A paged, sortable, searchable endpoint over `rows`, like a jpa-utils `Paginator`'s. */
export function fakeEndpoint(rows: readonly Person[]) {
  return (params: PageParams): Promise<PageDto<Person>> => {
    const term = params.search?.toLowerCase();
    const matching = term ? rows.filter((row) => row.name.toLowerCase().includes(term)) : [...rows];
    const key = params.sortBy === "EMAIL" ? "email" : "name";
    matching.sort((a, b) => a[key].localeCompare(b[key]) * (params.sortDirection === "DESC" ? -1 : 1));
    return Promise.resolve(pageOf(matching, params));
  };
}

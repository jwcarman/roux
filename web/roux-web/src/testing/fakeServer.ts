import type { PageDto, PageParams } from "../paging/paging";
import { pageOf } from "./pages";

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

/** A paged, sortable, searchable endpoint over `rows`, like the server's `page.Paginator`. */
export function fakeEndpoint(rows: readonly Person[]) {
  return (params: PageParams): Promise<PageDto<Person>> => {
    const term = params.search?.toLowerCase();
    const matching = term ? rows.filter((row) => row.name.toLowerCase().includes(term)) : [...rows];
    const key = params.sortBy === "EMAIL" ? "email" : "name";
    matching.sort((a, b) => a[key].localeCompare(b[key]) * (params.sortDirection === "DESC" ? -1 : 1));
    return Promise.resolve(pageOf(matching, params));
  };
}

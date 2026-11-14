// @vitest-environment jsdom
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PageDto, PageParams, TableSearch } from "../paging/paging";
import { fakeEndpoint, pageOf, people, type Person } from "../testing/fakeServer";
import { renderHookWithProviders } from "../testing/render";
import { useQueryTable, type TableParams, type UseQueryTableOptions } from "./useQueryTable";

const column = createColumnHelper<Person>();
const columns: ColumnDef<Person, unknown>[] = [
  column.accessor("name", { id: "NAME", header: "Name" }),
  column.accessor("email", { id: "EMAIL", header: "Email" }),
];

function setUp(options: Partial<UseQueryTableOptions<Person>> = {}, rows = people(60)) {
  const query = vi.fn(fakeEndpoint(rows));
  const rendered = renderHookWithProviders(
    (props: Partial<UseQueryTableOptions<Person>>) =>
      useQueryTable({
        queryKey: ["people"],
        query,
        columns,
        initialSort: { id: "NAME", desc: false },
        ...options,
        ...props,
      }),
    undefined,
    {},
  );
  return { query, ...rendered };
}

function lastParams(query: { mock: { calls: [PageParams][] } }): PageParams {
  return query.mock.calls[query.mock.calls.length - 1][0];
}

describe("useQueryTable", () => {
  it("asks for the first page in the initial sort, 25 rows at a time", async () => {
    const { query, result } = setUp();
    await waitFor(() => expect(result.current.page).toBeDefined());
    expect(query).toHaveBeenCalledTimes(1);
    expect(lastParams(query)).toEqual({ pageIndex: 0, pageSize: 25, sortBy: "NAME", sortDirection: "ASC" });
  });

  it("shows the page's rows, counted by the server", async () => {
    const { result } = setUp();
    await waitFor(() => expect(result.current.page).toBeDefined());
    const table = result.current.table;
    expect(
      table
        .getRowModel()
        .rows.map((row) => row.original.id)
        .slice(0, 2),
    ).toEqual(["p1", "p2"]);
    expect(table.getRowCount()).toBe(60);
    expect(table.getPageCount()).toBe(3);
  });

  it("keys rows by the row's id", async () => {
    const { result } = setUp({ getRowId: (row) => row.id });
    await waitFor(() => expect(result.current.page).toBeDefined());
    expect(result.current.table.getRowModel().rows[0].id).toBe("p1");
  });

  it("asks for the page the table moves to", async () => {
    const { query, result } = setUp();
    await waitFor(() => expect(result.current.page).toBeDefined());
    act(() => result.current.table.setPageIndex(2));
    await waitFor(() => expect(result.current.page?.pagination.pageIndex).toBe(2));
    expect(lastParams(query).pageIndex).toBe(2);
  });

  it("goes back to the first page when the sort changes", async () => {
    const { query, result } = setUp();
    await waitFor(() => expect(result.current.page).toBeDefined());
    act(() => result.current.table.setPageIndex(2));
    await waitFor(() => expect(result.current.page?.pagination.pageIndex).toBe(2));

    act(() => result.current.table.getColumn("EMAIL")?.toggleSorting(true));

    await waitFor(() => expect(lastParams(query)).toMatchObject({ sortBy: "EMAIL", sortDirection: "DESC" }));
    expect(lastParams(query).pageIndex).toBe(0);
    expect(query.mock.calls.some(([params]) => params.sortBy === "EMAIL" && params.pageIndex !== 0)).toBe(false);
  });

  it("goes back to the first page when the query key changes, even inside an object", async () => {
    const seen: { search: string | undefined; params: PageParams }[] = [];
    let search: string | undefined;
    const endpoint = fakeEndpoint(people(60));
    const query = (params: PageParams) => {
      seen.push({ search, params });
      return endpoint({ ...params, search });
    };
    const { result, rerender } = renderHookWithProviders(
      (props: { search: string | undefined }) =>
        useQueryTable({ queryKey: ["people", { search: props.search }], query, columns }),
      undefined,
      { search: undefined as string | undefined },
    );
    await waitFor(() => expect(result.current.page).toBeDefined());
    act(() => result.current.table.setPageIndex(2));
    await waitFor(() => expect(result.current.page?.pagination.pageIndex).toBe(2));

    search = "person 00";
    rerender({ search });

    await waitFor(() => expect(seen.some((call) => call.search === "person 00")).toBe(true));
    expect(seen.filter((call) => call.search === "person 00").map((call) => call.params.pageIndex)).toEqual([0]);
    expect(result.current.table.getState().pagination.pageIndex).toBe(0);
  });

  it("moves to the last page when the page it is on no longer exists", async () => {
    let rows = people(60);
    const query = vi.fn((params: PageParams) => Promise.resolve(pageOf(rows, params)));
    const { result } = setUp({ query });
    await waitFor(() => expect(result.current.page).toBeDefined());
    act(() => result.current.table.setPageIndex(2));
    await waitFor(() => expect(result.current.page?.pagination.pageIndex).toBe(2));

    rows = people(30);
    act(() => result.current.table.setPageIndex(2));
    await act(() => result.current.refetch());

    await waitFor(() => expect(result.current.table.getState().pagination.pageIndex).toBe(1));
    expect(lastParams(query).pageIndex).toBe(1);
  });

  it("never asks for more rows than a Paginator returns", async () => {
    const { query, result } = setUp({ initialPageSize: 500 });
    await waitFor(() => expect(result.current.page).toBeDefined());
    expect(lastParams(query).pageSize).toBe(100);

    act(() => result.current.table.setPageSize(250));
    await waitFor(() => expect(result.current.table.getState().pagination.pageSize).toBe(100));
  });

  it("keeps showing the current page while the next one loads", async () => {
    let release: (page: PageDto<Person>) => void = () => undefined;
    const rows = people(60);
    const query = vi.fn((params: PageParams) =>
      params.pageIndex === 0
        ? fakeEndpoint(rows)(params)
        : new Promise<PageDto<Person>>((resolve) => (release = resolve)),
    );
    const { result } = setUp({ query });
    await waitFor(() => expect(result.current.page).toBeDefined());

    act(() => result.current.table.setPageIndex(1));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(result.current.table.getRowModel().rows[0].original.id).toBe("p1");

    act(() => release(pageOf(rows, { pageIndex: 1, pageSize: 25 })));
    await waitFor(() => expect(result.current.table.getRowModel().rows[0].original.id).toBe("p26"));
  });

  it("sorts a column ascending first, even before any rows have loaded", () => {
    const { result } = setUp({ query: () => new Promise<PageDto<Person>>(() => undefined) });
    act(() => result.current.table.getColumn("EMAIL")?.toggleSorting());
    expect(result.current.table.getState().sorting).toEqual([{ id: "EMAIL", desc: false }]);
  });

  it("reports a failed load", async () => {
    const { result } = setUp({ query: () => Promise.reject(new Error("down")) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.table.getRowModel().rows).toEqual([]);
  });
});

describe("useQueryTable with params kept by the caller", () => {
  function controlled(params: TableSearch, rows = people(60)) {
    const onParamsChange = vi.fn<(next: TableParams) => void>();
    const view = setUp({ params, onParamsChange }, rows);
    return { onParamsChange, ...view };
  }

  it("shows the page and sort it is given", async () => {
    const { query, result } = controlled({ pageIndex: 1, pageSize: 10, sortBy: "EMAIL", sortDirection: "DESC" });
    await waitFor(() => expect(result.current.page).toBeDefined());
    expect(lastParams(query)).toEqual({ pageIndex: 1, pageSize: 10, sortBy: "EMAIL", sortDirection: "DESC" });
    expect(result.current.table.getState().sorting).toEqual([{ id: "EMAIL", desc: true }]);
  });

  it("applies a direction given without a column to the initial sort's column", async () => {
    // The URL drops sortBy when it is the default, so "Name, descending" arrives as only a direction.
    const { query, result } = controlled({ sortDirection: "DESC" });
    await waitFor(() => expect(result.current.page).toBeDefined());
    expect(result.current.table.getState().sorting).toEqual([{ id: "NAME", desc: true }]);
    expect(lastParams(query)).toMatchObject({ sortBy: "NAME", sortDirection: "DESC" });
  });

  it("falls back to the first page, the default size and the initial sort", async () => {
    const { query, result } = controlled({});
    await waitFor(() => expect(result.current.page).toBeDefined());
    expect(lastParams(query)).toEqual({ pageIndex: 0, pageSize: 25, sortBy: "NAME", sortDirection: "ASC" });
  });

  it("reports a page change instead of making it", async () => {
    const { onParamsChange, result } = controlled({});
    await waitFor(() => expect(result.current.page).toBeDefined());
    act(() => result.current.table.setPageIndex(2));
    expect(onParamsChange).toHaveBeenLastCalledWith({
      pageIndex: 2,
      pageSize: 25,
      sortBy: "NAME",
      sortDirection: "ASC",
    });
    expect(result.current.table.getState().pagination.pageIndex).toBe(0);
  });

  it("reports a sort change from the first page", async () => {
    const { onParamsChange, result } = controlled({ pageIndex: 2 });
    await waitFor(() => expect(result.current.page).toBeDefined());
    act(() => result.current.table.getColumn("EMAIL")?.toggleSorting(true));
    expect(onParamsChange).toHaveBeenLastCalledWith({
      pageIndex: 0,
      pageSize: 25,
      sortBy: "EMAIL",
      sortDirection: "DESC",
    });
  });

  it("caps a page size it is given at what a Paginator returns", async () => {
    const { query, result } = controlled({ pageSize: 500 });
    await waitFor(() => expect(result.current.page).toBeDefined());
    expect(lastParams(query).pageSize).toBe(100);
  });

  it("reports the last page when the page it is given does not exist", async () => {
    const { onParamsChange, query } = controlled({ pageIndex: 9 }, people(30));
    await waitFor(() => expect(onParamsChange).toHaveBeenCalledWith(expect.objectContaining({ pageIndex: 1 })));
    expect(query.mock.calls.map(([params]) => params.pageIndex)).toEqual([9]);
  });
});

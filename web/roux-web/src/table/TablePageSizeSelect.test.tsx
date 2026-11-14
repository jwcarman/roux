// @vitest-environment jsdom
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../testing/render";
import { TablePageSizeSelect } from "./TablePageSizeSelect";

function Select({ pageSizes }: { pageSizes?: number[] }) {
  const table = useReactTable({
    data: [],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 25 } },
  });
  return <TablePageSizeSelect table={table} pageSizes={pageSizes} />;
}

function options(): string[] {
  return within(screen.getByRole("combobox", { name: "Rows per page" }))
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

describe("TablePageSizeSelect", () => {
  it("offers 10, 25, 50 and 100 rows unless told otherwise", () => {
    renderWithProviders(<Select />);
    expect(options()).toEqual(["10", "25", "50", "100"]);
  });

  it("leaves out sizes a Paginator would not return, keeps the largest it would, and sorts what is left", () => {
    renderWithProviders(<Select pageSizes={[100, 500, 101, 0, -5, 10]} />);
    expect(options()).toEqual(["10", "25", "100"]);
  });
});

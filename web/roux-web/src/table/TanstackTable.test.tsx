// @vitest-environment jsdom
import { createColumnHelper, getCoreRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { people, type Person } from "../testing/fakeServer";
import { renderWithProviders } from "../testing/render";
import { TanstackTable, type TanstackTableProps } from "./TanstackTable";

const column = createColumnHelper<Person>();
const grouped: ColumnDef<Person, unknown>[] = [
  column.accessor("name", { id: "NAME", header: "Name" }),
  column.group({ header: "Contact", columns: [column.accessor("email", { id: "EMAIL", header: "Email" })] }),
];
const flat: ColumnDef<Person, unknown>[] = [
  column.accessor("name", { id: "NAME", header: "Name" }),
  column.accessor("email", { id: "EMAIL", header: "Email" }),
];

function Harness({
  columns = flat,
  rows = 1,
  sorting = [],
  ...props
}: { columns?: ColumnDef<Person, unknown>[]; rows?: number; sorting?: SortingState } & Partial<TanstackTableProps<Person>>) {
  const table = useReactTable({
    data: people(rows),
    columns,
    state: { sorting },
    getCoreRowModel: getCoreRowModel(),
  });
  return <TanstackTable table={table} aria-label="People" {...props} />;
}

describe("TanstackTable", () => {
  it("leaves the cell above an ungrouped column empty when other columns are grouped", () => {
    renderWithProviders(<Harness columns={grouped} />);
    const [groupRow] = within(screen.getByRole("table", { name: "People" })).getAllByRole("row");
    const headers = within(groupRow).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["", "Contact"]);
  });

  it("says there are no rows, not that it is loading or failed, by default", () => {
    renderWithProviders(<Harness rows={0} />);
    expect(screen.getByText("No rows.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a different icon for an ascending, a descending and an unsorted column", () => {
    const icon = (sorting: SortingState) => {
      const { container, unmount } = renderWithProviders(<Harness sorting={sorting} />);
      const svg = within(screen.getByRole("columnheader", { name: "Name" })).getByRole("button").querySelector("svg");
      const html = svg?.outerHTML ?? "";
      unmount();
      container.remove();
      return html;
    };
    const asc = icon([{ id: "NAME", desc: false }]);
    const desc = icon([{ id: "NAME", desc: true }]);
    const none = icon([]);
    expect(new Set([asc, desc, none]).size).toBe(3);
    expect(none).toContain("opacity");
  });
});

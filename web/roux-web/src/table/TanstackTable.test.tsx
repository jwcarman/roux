// @vitest-environment jsdom
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { people, type Person } from "../testing/fakeServer";
import { rulesFor } from "../testing/css";
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
}: { columns?: ColumnDef<Person, unknown>[]; rows?: number; sorting?: SortingState } & Partial<
  TanstackTableProps<Person>
>) {
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
      const svg = within(screen.getByRole("columnheader", { name: "Name" }))
        .getByRole("button")
        .querySelector("svg");
      const html = svg?.outerHTML ?? "";
      unmount();
      container.remove();
      return html;
    };
    const asc = icon([{ id: "NAME", desc: false }]);
    const desc = icon([{ id: "NAME", desc: true }]);
    const none = icon([]);
    expect(new Set([asc, desc, none]).size).toBe(3);
  });

  it("lines a sortable heading up with the values under it", () => {
    renderWithProviders(<Harness />);
    const sort = within(screen.getByRole("columnheader", { name: "Name" })).getByRole("button");
    // The button's own padding, taken back, so its text starts where the cell's does.
    expect(rulesFor(sort)).toMatch(/margin-inline-start:\s*calc\(var\(--chakra-spacing-2\\?\.5\) \* -1\)/);
  });

  it("shades no row but the one under the pointer", () => {
    renderWithProviders(<Harness rows={3} />);
    const table = screen.getByRole("table", { name: "People" });
    const [, first] = within(table).getAllByRole("row");
    expect(rulesFor(first)).not.toMatch(/nth-of-type/);
    const [, body] = within(table).getAllByRole("rowgroup");
    expect(rulesFor(body)).toMatch(/tr:is\(:hover/);
  });

  it("draws its headings quietly: small muted text, with no band behind them", () => {
    renderWithProviders(<Harness />);
    const [headings] = within(screen.getByRole("table", { name: "People" })).getAllByRole("row");
    // The page's own background, which a sticky heading needs, not a band of its own.
    expect(rulesFor(headings)).not.toMatch(/bg-subtle|bg-muted/);
    const name = screen.getByRole("columnheader", { name: "Name" });
    expect(rulesFor(name)).toMatch(/color:\s*var\(--chakra-colors-fg-muted\)/);
    expect(rulesFor(name)).toMatch(/textStyle-xs|font-size:\s*var\(--chakra-font-sizes-xs\)/);
  });

  it("shows the sort arrow only on the sorted column, and a faint one under the pointer", () => {
    renderWithProviders(<Harness sorting={[{ id: "NAME", desc: false }]} />);
    const arrow = (name: string) =>
      within(screen.getByRole("columnheader", { name })).getByRole("button").querySelector("svg")!;
    expect(rulesFor(arrow("Name"))).not.toMatch(/opacity/);
    expect(rulesFor(arrow("Email"))).toMatch(/opacity:\s*0[;}]/);
    expect(rulesFor(arrow("Email"))).toMatch(/group:is\(:hover[^}]*opacity:\s*0?\.5/);
    expect(rulesFor(arrow("Email"))).toMatch(/group:is\(:focus-visible[^}]*opacity:\s*0?\.5/);
  });

  it("sits on the page, with no box around it", () => {
    renderWithProviders(<Harness />);
    const frame = screen.getByRole("table", { name: "People" }).parentElement!;
    expect(rulesFor(frame)).not.toMatch(/border|background/);
  });

  it("keeps its headings in view down a long list, from a tablet up", () => {
    renderWithProviders(<Harness />);
    const table = screen.getByRole("table", { name: "People" });
    const [headings] = within(table).getAllByRole("rowgroup");
    expect(rulesFor(headings)).toMatch(/position:\s*sticky/);
    // A frame that scrolls sideways would hold the headings, so only a phone's does.
    expect(rulesFor(table.parentElement!)).toMatch(/overflow-x:\s*auto/);
    expect(rulesFor(table.parentElement!)).toMatch(/min-width: 48rem\)[^}]*overflow-x:\s*visible/);
  });

  it("gives each row room", () => {
    renderWithProviders(<Harness />);
    const [cell] = within(screen.getByRole("table", { name: "People" })).getAllByRole("cell");
    expect(rulesFor(cell)).toMatch(/padding-block:\s*var\(--chakra-spacing-3\\?\.5\)/);
    expect(rulesFor(cell)).toMatch(/padding-inline:\s*var\(--chakra-spacing-4\)/);
  });

  it("holds the rows' places while they load", () => {
    renderWithProviders(<Harness rows={0} isLoading />);
    const table = screen.getByRole("table", { name: "People" });
    const [, ...placeholders] = within(table).getAllByRole("row");
    expect(placeholders).toHaveLength(3);
    for (const row of placeholders) {
      expect(within(row).getAllByRole("cell")).toHaveLength(2);
    }
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("No rows.")).toBeNull();
  });

  it("keeps the rows it has while more load", () => {
    renderWithProviders(<Harness rows={2} isLoading />);
    expect(within(screen.getByRole("table", { name: "People" })).getAllByRole("row")).toHaveLength(3);
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });
});

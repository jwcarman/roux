// @vitest-environment jsdom
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PageDto, PageParams } from "../paging/paging";
import { fakeEndpoint, people, type Person } from "../testing/fakeServer";
import { renderWithProviders } from "../testing/render";
import { QueryTable } from "./QueryTable";

const column = createColumnHelper<Person>();
const columns: ColumnDef<Person, unknown>[] = [
  column.accessor("name", { id: "NAME", header: "Name" }),
  column.accessor("email", { id: "EMAIL", header: "Email" }),
  column.display({ id: "actions", header: "Actions", cell: () => "…", enableSorting: false }),
];

function show(query: (params: PageParams) => Promise<PageDto<Person>> = fakeEndpoint(people(60))) {
  const spy = vi.fn(query);
  renderWithProviders(
    <QueryTable
      aria-label="People"
      queryKey={["people"]}
      query={spy}
      columns={columns}
      initialSort={{ id: "NAME", desc: false }}
      getRowId={(row) => row.id}
      emptyText="Nobody here."
      errorText="Could not load the people."
    />,
  );
  return { query: spy, user: userEvent.setup() };
}

function table() {
  return screen.getByRole("table", { name: "People" });
}

function firstNames(count = 2): string[] {
  const rows = within(table())
    .getAllByRole("row")
    .slice(1, 1 + count);
  return rows.map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
}

describe("QueryTable", () => {
  it("shows the first page in the initial sort", async () => {
    show();
    await waitFor(() => expect(firstNames()).toEqual(["Person 001", "Person 002"]));
    expect(within(table()).getAllByRole("row")).toHaveLength(26);
  });

  it("marks the sorted column for assistive technology", async () => {
    show();
    await screen.findByText("Person 001");
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "Email" })).toHaveAttribute("aria-sort", "none");
  });

  it("sorts a column with a button, so the keyboard can sort too", async () => {
    const { user } = show();
    await screen.findByText("Person 001");
    await user.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() => expect(firstNames()).toEqual(["Person 060", "Person 059"]));
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "descending");

    screen.getByRole("button", { name: "Email" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("columnheader", { name: "Email" })).toHaveAttribute("aria-sort", "ascending"),
    );
    expect(firstNames()).toEqual(["Person 060", "Person 059"]); // emails run the other way
  });

  it("offers no sort on a column that cannot be sorted", async () => {
    show();
    await screen.findByText("Person 001");
    expect(screen.queryByRole("button", { name: "Actions" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Actions" })).not.toHaveAttribute("aria-sort");
  });

  it("pages forward and back, and to either end", async () => {
    const { user } = show();
    await screen.findByText("Person 001");
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Person 026");
    await user.click(screen.getByRole("button", { name: "Last page" }));
    await screen.findByText("Person 060");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await screen.findByText("Person 026");
    await user.click(screen.getByRole("button", { name: "First page" }));
    await screen.findByText("Person 001");
  });

  it("goes to the page typed in, within the pages there are", async () => {
    const { user, query } = show();
    await screen.findByText("Person 001");
    const pageField = screen.getByRole("spinbutton", { name: "Page" });

    await user.clear(pageField);
    await user.type(pageField, "2");
    await screen.findByText("Person 026");

    await user.clear(pageField);
    await user.type(pageField, "9");
    await screen.findByText("Person 060");
    expect(query.mock.calls.every(([params]) => (params.pageIndex ?? 0) <= 2)).toBe(true);
  });

  it("ignores a cleared page field", async () => {
    const { user, query } = show();
    await screen.findByText("Person 001");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Person 026");
    const calls = query.mock.calls.length;

    await user.clear(screen.getByRole("spinbutton", { name: "Page" }));

    expect(query.mock.calls.length).toBe(calls);
    expect(screen.getByText("Person 026")).toBeInTheDocument();
  });

  it("says which rows it shows", async () => {
    const { user } = show();
    expect(await screen.findByText("Showing 1 to 25 of 60 rows")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Last page" }));
    expect(await screen.findByText("Showing 51 to 60 of 60 rows")).toBeInTheDocument();
  });

  it("changes the page size, never past what a Paginator returns", async () => {
    const { user, query } = show();
    await screen.findByText("Person 001");
    const sizes = screen.getByRole("combobox", { name: "Rows per page" });
    expect(
      within(sizes)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["10", "25", "50", "100"]);

    await user.selectOptions(sizes, "10");
    expect(await screen.findByText("Showing 1 to 10 of 60 rows")).toBeInTheDocument();
    expect(query.mock.calls.at(-1)?.[0].pageSize).toBe(10);
  });

  it("says when there are no rows, without a pager", async () => {
    show(fakeEndpoint([]));
    expect(await screen.findByText("Nobody here.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  });

  it("does not say there are no rows while the first page loads", async () => {
    show(() => new Promise<PageDto<Person>>(() => undefined));
    expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Nobody here.")).toBeNull();
  });

  it("says when the rows could not be loaded", async () => {
    show(() => Promise.reject(new Error("down")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the people.");
    expect(screen.queryByText("Nobody here.")).toBeNull();
  });
});

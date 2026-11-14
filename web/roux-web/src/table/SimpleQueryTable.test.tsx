// @vitest-environment jsdom
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { people, type Person } from "../testing/fakeServer";
import { renderWithProviders } from "../testing/render";
import { SimpleQueryTable } from "./SimpleQueryTable";

const column = createColumnHelper<Person>();
const columns: ColumnDef<Person, unknown>[] = [
  column.accessor("name", { id: "NAME", header: "Name" }),
  column.accessor("email", { id: "EMAIL", header: "Email" }),
];

function show(query: () => Promise<Person[]>, enabled = true, initialSort: { id: string; desc: boolean } | null = { id: "NAME", desc: false }) {
  const spy = vi.fn(query);
  renderWithProviders(
    <SimpleQueryTable
      aria-label="People"
      queryKey={["people", "all"]}
      query={spy}
      columns={columns}
      initialSort={initialSort ?? undefined}
      getRowId={(row) => row.id}
      enabled={enabled}
      emptyText="Nobody here."
      errorText="Could not load the people."
    />,
  );
  return { query: spy, user: userEvent.setup() };
}

function names(): string[] {
  const rows = within(screen.getByRole("table", { name: "People" }))
    .getAllByRole("row")
    .slice(1);
  return rows.map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
}

describe("SimpleQueryTable", () => {
  it("shows every row, sorted in the browser", async () => {
    show(() => Promise.resolve(people(3).reverse()));
    await waitFor(() => expect(names()).toEqual(["Person 001", "Person 002", "Person 003"]));
  });

  it("re-sorts without fetching again", async () => {
    const { user, query } = show(() => Promise.resolve(people(3)));
    await screen.findByText("Person 001");
    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(names()).toEqual(["Person 003", "Person 002", "Person 001"]);
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "descending");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("says when there are no rows", async () => {
    show(() => Promise.resolve([]));
    expect(await screen.findByText("Nobody here.")).toBeInTheDocument();
  });

  it("shows a spinner while loading", async () => {
    show(() => new Promise<Person[]>(() => undefined));
    expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("says when the rows could not be loaded", async () => {
    show(() => Promise.reject(new Error("down")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the people.");
    expect(screen.queryByText("Nobody here.")).toBeNull();
  });

  it("does not fetch until enabled", async () => {
    const { query } = show(() => Promise.resolve(people(3)), false);
    await screen.findByRole("table", { name: "People" });
    expect(query).not.toHaveBeenCalled();
  });

  it("shows the rows in the order given when there is no initial sort", async () => {
    show(() => Promise.resolve([...people(3)].reverse()), true, null);
    await screen.findByText("Person 003");
    expect(names()).toEqual(["Person 003", "Person 002", "Person 001"]);
  });

  it("fetches at once and sorts one column at a time", async () => {
    renderWithProviders(
      <SimpleQueryTable
        aria-label="People"
        queryKey={["people", "bare"]}
        query={() => Promise.resolve(people(3))}
        columns={columns}
        initialSort={{ id: "NAME", desc: false }}
      />,
    );
    await screen.findByText("Person 001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Name" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.keyboard("{/Shift}");
    expect(screen.getByRole("columnheader", { name: "Email" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "none");
  });

  it("never turns the sort off: a column sorts descending, then ascending again", async () => {
    const { user } = show(() => Promise.resolve(people(3)));
    await screen.findByText("Person 001");
    await user.click(screen.getByRole("button", { name: "Name" }));
    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
  });

  it("shows no error once the rows have loaded", async () => {
    show(() => Promise.resolve(people(3)));
    await screen.findByText("Person 001");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says by default that the rows could not be loaded", async () => {
    renderWithProviders(
      <SimpleQueryTable
        aria-label="People"
        queryKey={["people", "failing"]}
        query={() => Promise.reject(new Error("down"))}
        columns={columns}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the rows.");
  });
});

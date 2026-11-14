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

function show(query: () => Promise<Person[]>, enabled = true) {
  const spy = vi.fn(query);
  renderWithProviders(
    <SimpleQueryTable
      aria-label="People"
      queryKey={["people", "all"]}
      query={spy}
      columns={columns}
      initialSort={{ id: "NAME", desc: false }}
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
});

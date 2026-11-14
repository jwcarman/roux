// @vitest-environment jsdom
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { PageParams } from "../paging/paging";
import { fakeEndpoint, people, type Person } from "../testing/fakeServer";
import { renderWithProviders } from "../testing/render";
import { QueryTable } from "./QueryTable";
import { createSelectColumn } from "./selectColumn";

const column = createColumnHelper<Person>();
const endpoint = fakeEndpoint(people(30));

// Each fetch returns new objects, as a real endpoint does, so selection must go by key.
const query = async (params: PageParams) => {
  const page = await endpoint(params);
  return { ...page, data: page.data.map((row) => ({ ...row })) };
};

let selection: ReadonlyMap<string, Person> = new Map();

function Harness() {
  const [selected, setSelected] = useState<ReadonlyMap<string, Person>>(new Map());
  const columns: ColumnDef<Person, unknown>[] = [
    createSelectColumn<Person>({
      selected,
      onSelectedChange: (next) => {
        selection = next;
        setSelected(next);
      },
      keyOf: (row) => row.id,
      labelOf: (row) => row.name,
    }),
    column.accessor("name", { id: "NAME", header: "Name" }),
  ];
  return (
    <QueryTable
      aria-label="People"
      queryKey={["people"]}
      query={query}
      columns={columns}
      initialSort={{ id: "NAME", desc: false }}
      initialPageSize={10}
      getRowId={(row) => row.id}
    />
  );
}

function show() {
  selection = new Map();
  renderWithProviders(<Harness />);
  return userEvent.setup();
}

function selectAll() {
  return screen.getByRole("checkbox", { name: "Select every row on this page" });
}

describe("createSelectColumn", () => {
  it("selects and unselects a row by its key", async () => {
    const user = show();
    await user.click(await screen.findByRole("checkbox", { name: "Select Person 002" }));
    expect([...selection.keys()]).toEqual(["p2"]);
    expect(screen.getByRole("checkbox", { name: "Select Person 002" })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Select Person 002" }));
    expect(selection.size).toBe(0);
  });

  it("shows the page as partly selected when some of its rows are", async () => {
    const user = show();
    await user.click(await screen.findByRole("checkbox", { name: "Select Person 002" }));
    expect(selectAll()).toBePartiallyChecked();
  });

  it("selects every row on the page", async () => {
    const user = show();
    await screen.findByText("Person 001");
    await user.click(selectAll());
    expect(selection.size).toBe(10);
    expect(selectAll()).toBeChecked();
  });

  it("keeps a selection across pages, and unselecting a page leaves the others", async () => {
    const user = show();
    await user.click(await screen.findByRole("checkbox", { name: "Select Person 001" }));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Person 011");
    await user.click(selectAll());
    expect(selection.size).toBe(11);

    await user.click(selectAll());
    expect([...selection.keys()]).toEqual(["p1"]);

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Person 001" })).toBeChecked());
  });

  it("shows an untouched page as unchecked", async () => {
    show();
    await screen.findByText("Person 001");
    expect(selectAll()).not.toBeChecked();
    expect(selectAll()).not.toBePartiallyChecked();
    expect(selectAll()).toBeEnabled();
  });

  it("offers nothing to select on an empty page", async () => {
    selection = new Map();
    renderWithProviders(
      <QueryTable
        aria-label="People"
        queryKey={["nobody"]}
        query={fakeEndpoint([])}
        columns={[
          createSelectColumn<Person>({
            selected: selection,
            onSelectedChange: () => undefined,
            keyOf: (row) => row.id,
            labelOf: (row) => row.name,
          }),
        ]}
        emptyText="Nobody here."
      />,
    );
    await screen.findByText("Nobody here.");
    expect(selectAll()).toBeDisabled();
    expect(selectAll()).not.toBeChecked();
  });
});

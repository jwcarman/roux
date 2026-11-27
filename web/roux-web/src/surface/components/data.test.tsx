// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { pageOf } from "../../testing";
import { renderInRouter } from "../../testing/router";
import { renderSurface, startSurface } from "../testSurface";
import { sortingOf } from "./data";

const jobs = [
  {
    customer: "Ann Lee",
    job: "Leaky tap",
    due: "2026-12-01",
    price: { minorUnits: 12500, currency: "USD" },
    status: "Unassigned",
  },
  {
    customer: "Bo Diaz",
    job: "New boiler",
    due: "2026-12-03",
    price: { minorUnits: 250000, currency: "USD" },
    status: "Done",
  },
];

const names = [
  { id: "7", name: "Ann Lee", at: "10:30", crew: ["Cy", "Di"] },
  { id: "8", name: "Bo Diaz", at: "14:05", crew: [] },
  { id: "9", name: "Cy Fox", at: "16:00", crew: ["Ed"] },
];

const table = (extra: Record<string, unknown> = {}) => [
  {
    id: "root",
    component: "DataTable",
    rows: { "@path": "/jobs" },
    columns: [
      { header: "Name", field: "name", sort: "byName" },
      { header: "Crew", field: "crew", sort: "byCrew", format: "list" },
      { header: "At", field: "at" },
    ],
    ...extra,
  },
];

describe("DataTable", () => {
  describe("a column's emptyText", () => {
    const rows = [
      { name: "A", at: null, tag: "", crew: [] },
      { name: "B", at: "", tag: "Done", crew: ["Cy"] },
      { name: "C", at: "10:00", tag: null, crew: undefined },
    ];
    const columns = (emptyText?: string) => {
      const extra = emptyText === undefined ? {} : { emptyText };
      return [
        { header: "Name", field: "name" },
        { header: "At", field: "at", format: "time", ...extra },
        { header: "Tag", field: "tag", format: "badge", ...extra },
        { header: "Crew", field: "crew", format: "list", ...extra },
      ];
    };
    const render = (emptyText?: string) =>
      renderSurface([{ id: "root", component: "DataTable", rows: { "@path": "/rows" }, columns: columns(emptyText) }], {
        rows: pageOf(rows, {}),
      });

    it("shows the text muted for a missing value, in any format", () => {
      render("None");
      // A: time null, badge "", list [] ; B: time ""; C: badge null, list missing.
      const nones = screen.getAllByText("None");
      expect(nones).toHaveLength(6);
      for (const none of nones) expect(getComputedStyle(none).color).toBe("rgb(82, 82, 91)");
      expect(screen.getByText(/^10:00/)).toBeTruthy();
      expect(screen.getByText("Done").dataset.palette).toBe("gray");
      expect(screen.getByText("Cy")).toBeTruthy();
      expect(screen.getAllByText("None").every((none) => none.dataset.palette === undefined)).toBe(true);
    });

    it("shows no badge for an empty badge cell", () => {
      render("None");
      expect(document.querySelectorAll("[data-palette]")).toHaveLength(1);
    });

    it("leaves cells as they are without emptyText", () => {
      render();
      expect(screen.queryByText("None")).toBeNull();
      expect(document.querySelectorAll("[data-palette]")).toHaveLength(3);
    });
  });

  it("colors badges by tone", () => {
    renderSurface(
      [
        {
          id: "root",
          component: "DataTable",
          rows: { "@path": "/jobs" },
          columns: [
            { header: "Customer", field: "customer" },
            { header: "Status", field: "status", format: "badge", tones: { Unassigned: "warning", Done: "success" } },
            { header: "Price", field: "price", format: "money" },
            { header: "Due", field: "due", format: "date" },
          ],
        },
      ],
      { jobs: pageOf(jobs, {}) },
    );
    expect(screen.getByText("Unassigned").dataset.palette).toBe("orange");
    expect(screen.getByText("Done").dataset.palette).toBe("green");
    expect(screen.getByText("$125.00")).toBeTruthy();
    expect(screen.getByText("Dec 1, 2026")).toBeTruthy();
  });

  it("shows a neutral badge for a value with no tone and for no value", () => {
    renderSurface(
      [
        {
          id: "root",
          component: "DataTable",
          rows: { "@path": "/jobs" },
          columns: [{ header: "Status", field: "status", format: "badge" }],
        },
      ],
      { jobs: pageOf([{ status: "Open" }, {}], {}) },
    );
    expect(screen.getByText("Open").dataset.palette).toBe("gray");
  });

  it("shows the page's rows and its pagination", () => {
    renderSurface(table(), { jobs: pageOf(names, { pageIndex: 1, pageSize: 2 }) });
    expect(screen.getByText("Cy Fox")).toBeTruthy();
    expect(screen.queryByText("Ann Lee")).toBeNull();
    expect(screen.getByText("Showing 3 to 3 of 3 rows")).toBeTruthy();
    expect(screen.getByText("of 2")).toBeTruthy();
  });

  it("shows the empty text when the page has no rows or the data is not there yet", () => {
    renderSurface(table({ emptyText: "No jobs yet" }), { jobs: pageOf([], {}) });
    expect(screen.getByText("No jobs yet")).toBeTruthy();
  });

  it("says Nothing yet when the page has no rows and there is no emptyText", () => {
    renderSurface(table(), { jobs: pageOf([], {}) });
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });

  it("shows the empty text until the page is there", () => {
    renderSurface(table(), {});
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the empty text for anything that is not a page", () => {
    renderSurface(table({ emptyText: "Loading jobs" }), { jobs: "loading" });
    expect(screen.getByText("Loading jobs")).toBeTruthy();
  });

  it("leaves the page size to the server", () => {
    renderSurface(table(), { jobs: pageOf(names, { pageIndex: 0, pageSize: 2 }) });
    expect(screen.queryByLabelText("Rows per page")).toBeNull();
  });

  it("paging writes pageIndex", async () => {
    const surface = renderSurface(table({ pageIndex: { "@path": "/page" } }), {
      jobs: pageOf(names, { pageIndex: 0, pageSize: 2 }),
      page: 0,
    });
    await userEvent.click(screen.getByLabelText("Next page"));
    expect(surface.read("/page")).toBe(1);
  });

  it("paging without a bound pageIndex writes nothing and does not fail", async () => {
    const surface = renderSurface(table(), { jobs: pageOf(names, { pageIndex: 0, pageSize: 2 }) });
    await userEvent.click(screen.getByLabelText("Next page"));
    expect(surface.read("/page")).toBeUndefined();
  });

  it("a sortable header writes sortBy and flips sortDirection", async () => {
    const surface = renderSurface(table({ sortBy: { "@path": "/by" }, sortDirection: { "@path": "/dir" } }), {
      jobs: pageOf(names, {}),
      by: "",
      dir: "ASC",
    });
    const sort = screen.getByRole("button", { name: "Name" });
    await userEvent.click(sort);
    expect(surface.read("/by")).toBe("byName");
    expect(surface.read("/dir")).toBe("ASC");
    await userEvent.click(sort);
    expect(surface.read("/dir")).toBe("DESC");
    await userEvent.click(sort);
    expect(surface.read("/by")).toBe("byName");
    expect(surface.read("/dir")).toBe("ASC");
  });

  it("sorting goes back to the first page", async () => {
    const surface = renderSurface(
      table({ pageIndex: { "@path": "/page" }, sortBy: { "@path": "/by" }, sortDirection: { "@path": "/dir" } }),
      { jobs: pageOf(names, { pageIndex: 1, pageSize: 2 }), page: 1, by: "", dir: "ASC" },
    );
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(surface.read("/page")).toBe(0);
  });

  it("marks the sorted column and leaves a column with no sort unsortable", () => {
    renderSurface(table({ sortBy: "byName", sortDirection: "DESC" }), { jobs: pageOf(names, {}) });
    expect(screen.getByRole("columnheader", { name: "Name" }).getAttribute("aria-sort")).toBe("descending");
    expect(screen.getByRole("columnheader", { name: "Crew" }).getAttribute("aria-sort")).toBe("none");
    expect(screen.queryByRole("button", { name: "At" })).toBeNull();
  });

  it("sorts ascending when sortDirection is not given", () => {
    renderSurface(table({ sortBy: "byName" }), { jobs: pageOf(names, {}) });
    expect(screen.getByRole("columnheader", { name: "Name" }).getAttribute("aria-sort")).toBe("ascending");
  });

  it("sorting with nothing bound writes nothing and does not fail", async () => {
    renderSurface(table(), { jobs: pageOf(names, {}) });
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(screen.getByText("Ann Lee")).toBeTruthy();
  });

  it("a link column links to the route with the row's params", async () => {
    const { element } = startSurface(
      table({
        columns: [{ header: "Name", field: "name", link: { to: "/members/$id", params: { id: "id" } } }],
      }),
      { jobs: pageOf(names, {}) },
    );
    renderInRouter(element);
    const link = await screen.findByRole("link", { name: "Ann Lee" });
    expect(link.getAttribute("href")).toBe("/members/7");
    expect(screen.getByRole("link", { name: "Cy Fox" }).getAttribute("href")).toBe("/members/9");
  });

  it("list joins with commas", () => {
    renderSurface(table({ columns: [{ header: "Crew", field: "crew", format: "list" }] }), { jobs: pageOf(names, {}) });
    expect(screen.getByText("Cy, Di")).toBeTruthy();
    expect(screen.getByText("Ed")).toBeTruthy();
  });

  it("time shows hh:mm", () => {
    renderSurface(table({ columns: [{ header: "At", field: "at", format: "time" }] }), { jobs: pageOf(names, {}) });
    expect(screen.getByText("10:30 AM")).toBeTruthy();
    expect(screen.getByText("2:05 PM")).toBeTruthy();
  });

  it("shows other values as text", () => {
    renderSurface(table({ columns: [{ header: "Id", field: "id" }] }), { jobs: pageOf(names, {}) });
    expect(screen.getByText("7")).toBeTruthy();
  });
});

describe("sortingOf", () => {
  it("sorts by the column, in the direction", () => {
    expect(sortingOf("byName", "DESC")).toEqual([{ id: "byName", desc: true }]);
    expect(sortingOf("byName", "ASC")).toEqual([{ id: "byName", desc: false }]);
    expect(sortingOf("byName", undefined)).toEqual([{ id: "byName", desc: false }]);
  });

  it("does not sort without a column", () => {
    expect(sortingOf(undefined, "DESC")).toEqual([]);
    expect(sortingOf("", "DESC")).toEqual([]);
  });
});

describe("CardList", () => {
  it("renders one card per row", () => {
    const { view } = renderSurface(
      [
        {
          id: "root",
          component: "CardList",
          rows: { "@path": "/jobs" },
          title: "customer",
          lines: [{ field: "job" }, { field: "price", format: "money" }],
          badge: { field: "status", tones: { Unassigned: "warning" } },
        },
      ],
      { jobs },
    );
    const cards = view.container.querySelectorAll('[data-component-id="root"] .chakra-card__root');
    expect(cards).toHaveLength(2);
    const first = within(cards[0] as HTMLElement);
    expect(first.getByText("Ann Lee")).toBeTruthy();
    expect(first.getByText("Leaky tap")).toBeTruthy();
    expect(first.getByText("$125.00")).toBeTruthy();
    expect(first.getByText("Unassigned").dataset.palette).toBe("orange");
  });

  it("shows the empty text with no rows", () => {
    renderSurface(
      [
        {
          id: "root",
          component: "CardList",
          rows: { "@path": "/jobs" },
          title: "customer",
          lines: [],
          emptyText: "No jobs yet",
        },
      ],
      { jobs: [] },
    );
    expect(screen.getByText("No jobs yet")).toBeTruthy();
  });

  it("shows the default empty text when the rows are not there", () => {
    renderSurface([{ id: "root", component: "CardList", rows: { "@path": "/jobs" }, title: "customer", lines: [] }], {
      jobs: "loading",
    });
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });
});

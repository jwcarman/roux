// @vitest-environment jsdom
import { cleanup, renderHook, screen } from "@testing-library/react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatValue, useComponentId } from "./layout";
import { pageOf } from "../../testing";
import { rulesFor } from "../../testing/css";
import { renderSurface, startSurface } from "../testSurface";
import { ThemeProvider } from "../../theme";

const jobs = pageOf([{ customer: "Ann Lee", job: "Leaky tap" }], {});

function bookAJob() {
  return renderSurface(
    [
      { id: "root", component: "Row", children: ["formCard", "roomCard"] },
      { id: "formCard", component: "Card", title: "Book a job", children: ["note"] },
      { id: "note", component: "Text", text: "Pick a plumber" },
      { id: "roomCard", component: "Card", title: "Who has room", children: ["room"] },
      {
        id: "room",
        component: "DataTable",
        rows: { "@path": "/jobs" },
        columns: [
          { header: "Customer", field: "customer" },
          { header: "Job", field: "job" },
        ],
      },
    ],
    { jobs },
  );
}

const byId = (id: string) => document.querySelector<HTMLElement>(`[data-component-id="${id}"]`);

describe("Row", () => {
  it("gives each child its own slot that can shrink, wraps, and gives a table the larger share", () => {
    bookAJob();
    const row = byId("root");
    const slots = [...(row?.children ?? [])] as HTMLElement[];
    expect(slots).toHaveLength(2);
    expect(getComputedStyle(row as HTMLElement).flexWrap).toBe("wrap");
    for (const slot of slots) {
      expect(slot.dataset.rowSlot).toBe("");
      expect(getComputedStyle(slot).flexBasis).toBe("0px");
    }
    expect(slots[1].querySelector("table")).not.toBeNull();
  });
});

describe("Row and Column layout", () => {
  const texts = (ids: string[]) => ids.map((id) => ({ id, component: "Text", text: id }));

  it("lets a Row's justify place children at their own width", () => {
    renderSurface([
      { id: "root", component: "Row", justify: "spaceBetween", children: ["a", "b"] },
      ...texts(["a", "b"]),
    ]);
    const row = byId("root") as HTMLElement;
    expect(getComputedStyle(row).justifyContent).toBe("space-between");
    for (const slot of [...row.children] as HTMLElement[]) {
      expect(getComputedStyle(slot).flexGrow).toBe("0");
      expect(getComputedStyle(slot).flexBasis).toBe("auto");
      expect(getComputedStyle(slot).minWidth).toBe("256px");
    }
  });

  it("gives a weighted child that many shares of a Row", () => {
    renderSurface([
      { id: "root", component: "Row", children: ["a", "b"] },
      { id: "a", component: "Text", text: "a", weight: 2 },
      { id: "b", component: "Text", text: "b" },
    ]);
    const [a, b] = [...(byId("root") as HTMLElement).children] as HTMLElement[];
    expect(getComputedStyle(a).flexGrow).toBe("2");
    expect(getComputedStyle(b).flexGrow).toBe("1");
  });

  it("lets a weighted child grow in a justified Row", () => {
    renderSurface([
      { id: "root", component: "Row", justify: "end", children: ["a", "b"] },
      { id: "a", component: "Text", text: "a", weight: 1 },
      { id: "b", component: "Text", text: "b" },
    ]);
    const [a, b] = [...(byId("root") as HTMLElement).children] as HTMLElement[];
    expect(getComputedStyle(byId("root") as HTMLElement).justifyContent).toBe("flex-end");
    expect(getComputedStyle(a).flexGrow).toBe("1");
    expect(getComputedStyle(a).flexBasis).toBe("0px");
    expect(getComputedStyle(b).flexGrow).toBe("0");
  });

  const gapOf = (component: "Row" | "Column", extra: Record<string, unknown>) => {
    renderSurface([{ id: "root", component, children: ["a"], ...extra }, ...texts(["a"])]);
    return getComputedStyle(byId("root") as HTMLElement).gap;
  };

  it("spaces a Column's and a Row's children by a gap of 4 unless told otherwise", () => {
    expect(gapOf("Column", {})).toBe("16px");
    cleanup();
    expect(gapOf("Row", {})).toBe("16px");
  });

  it("spaces children by the gap", () => {
    expect(gapOf("Column", { gap: 2 })).toBe("8px");
    cleanup();
    expect(gapOf("Row", { gap: 8 })).toBe("32px");
  });

  it("stretches a Row's children unless told otherwise", () => {
    renderSurface([{ id: "root", component: "Row", children: ["a"] }, ...texts(["a"])]);
    expect(getComputedStyle(byId("root") as HTMLElement).alignItems).toBe("stretch");
  });

  it("aligns a Row's children", () => {
    renderSurface([{ id: "root", component: "Row", align: "center", children: ["a"] }, ...texts(["a"])]);
    expect(getComputedStyle(byId("root") as HTMLElement).alignItems).toBe("center");
  });

  it("places and aligns a Column's children", () => {
    renderSurface([
      { id: "root", component: "Column", justify: "spaceAround", align: "end", children: ["a"] },
      ...texts(["a"]),
    ]);
    const column = getComputedStyle(byId("root") as HTMLElement);
    expect(column.justifyContent).toBe("space-around");
    expect(column.alignItems).toBe("flex-end");
  });

  it("stretches a Column's children unless told otherwise", () => {
    renderSurface([{ id: "root", component: "Column", children: ["a"] }, ...texts(["a"])]);
    expect(getComputedStyle(byId("root") as HTMLElement).alignItems).toBe("stretch");
  });
});

describe("Card and DataTable", () => {
  it("keep the table inside its Card", () => {
    bookAJob();
    expect(getComputedStyle(byId("roomCard") as HTMLElement).minWidth).toMatch(/^0(px)?$/);
    const table = getComputedStyle(byId("room") as HTMLElement);
    expect(table.overflowX).toBe("auto");
    expect(table.minWidth).toMatch(/^0(px)?$/);
  });
});

describe("a DataTable alone in a Card", () => {
  const cardWith = (children: string[]) => [
    { id: "root", component: "Card", children },
    {
      id: "table",
      component: "DataTable",
      rows: { "@path": "/rows" },
      columns: [{ header: "Name", field: "name" }],
    },
    { id: "note", component: "Text", text: "A note" },
  ];
  const rows = {
    rows: {
      data: [{ name: "Ann" }],
      pagination: { pageIndex: 0, pageSize: 10, totalElementCount: 1, totalPageCount: 1 },
    },
  };
  const body = () => (byId("root") as HTMLElement).querySelector(".chakra-card__body") as HTMLElement;

  /** Whether the Card body's own rule for a table alone (its padding off) selects the body, in the DOM the surface really made. */
  const paddingOff = () => {
    const selector = /(\.css-[\w-]+:has\([^{]*\))\{[^}]*padding:0/.exec(rulesFor(body()))?.[1];
    return selector !== undefined && body().matches(selector);
  };

  it("fills the Card edge to edge as the surface really renders it, since its cells carry their own padding", () => {
    renderSurface(cardWith(["table"]), rows);
    expect(paddingOff()).toBe(true);
  });

  it("leaves the Card's padding when the table has company", () => {
    renderSurface(cardWith(["note", "table"]), rows);
    expect(paddingOff()).toBe(false);
  });

  it("takes the Card's background, in the rows and the headings", () => {
    renderSurface(cardWith(["table"]), rows);
    for (const row of document.querySelectorAll("tr")) {
      expect(getComputedStyle(row).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    }
  });

  it("pads a table's empty message, which has no cells to do it", () => {
    renderSurface(cardWith(["table"]), { rows: [] });
    expect(rulesFor(screen.getByText("Nothing yet"))).toMatch(/padding:\s*var\(--chakra-spacing-4\)/);
  });

  it("keeps the table's footer in line with the cells", () => {
    renderSurface(cardWith(["table"]), rows);
    const footer = screen.getByText("1 row").parentElement as HTMLElement;
    expect(rulesFor(footer)).toMatch(/padding-inline:\s*var\(--chakra-spacing-4\)/);
    expect(rulesFor(footer)).toMatch(/padding-bottom:\s*var\(--chakra-spacing-3\)/);
  });

  it("marks the table, so a Card can tell it from other children", () => {
    renderSurface(cardWith(["note", "table"]), rows);
    expect(byId("table")).toHaveAttribute("data-data-table");
    expect(byId("note")).not.toHaveAttribute("data-data-table");
  });
});

describe("Column", () => {
  it("builds a template's child for each item in the data model, each with its own key", () => {
    const errors = vi.spyOn(console, "error");
    renderSurface(
      [
        { id: "root", component: "Column", children: { componentId: "item", path: "/names" } },
        { id: "item", component: "Text", text: { "@path": "name" } },
      ],
      { names: [{ name: "Ann" }, { name: "Bo" }] },
    );
    expect(screen.getByText("Ann")).toBeTruthy();
    expect(screen.getByText("Bo")).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("content", () => {
  const classOf = (id: string) => (byId(id) as HTMLElement).className;
  const style = (name: string, id: string) => getComputedStyle(byId(id) as HTMLElement).getPropertyValue(name);

  it("shows a heading at its size, xl unless told otherwise", () => {
    renderSurface([
      { id: "root", component: "Column", children: ["title", "explicit", "small"] },
      { id: "title", component: "Heading", text: "Jobs" },
      { id: "explicit", component: "Heading", text: "Same", size: "xl" },
      { id: "small", component: "Heading", text: "Aside", size: "sm" },
    ]);
    expect(screen.getByRole("heading", { name: "Jobs" })).toBeTruthy();
    // Emotion names a style's class by its content: the same size is the same class.
    expect(classOf("title")).toBe(classOf("explicit"));
    expect(classOf("title")).not.toBe(classOf("small"));
  });

  it("mutes a paragraph when told to", () => {
    renderSurface([
      { id: "root", component: "Column", children: ["plain", "muted"] },
      { id: "plain", component: "Text", text: "Plain" },
      { id: "muted", component: "Text", text: "All of them", muted: true },
    ]);
    expect(style("color", "muted")).not.toBe(style("color", "plain"));
  });

  it("titles a Card only when it has a title, and colors its border by tone", () => {
    renderSurface([
      { id: "root", component: "Column", children: ["plain", "warn", "bad"] },
      { id: "plain", component: "Card", children: [] },
      { id: "warn", component: "Card", title: "Late", tone: "warning", children: [] },
      { id: "bad", component: "Card", tone: "danger", children: [] },
    ]);
    expect(screen.getByText("Late")).toBeTruthy();
    expect(document.querySelectorAll(".chakra-card__header")).toHaveLength(1);
    const border = (id: string) => style("border-color", id);
    expect(border("warn")).toBe("rgb(253, 186, 116)");
    expect(border("bad")).not.toBe(border("warn"));
    expect(border("plain")).not.toBe(border("warn"));
    expect(border("plain")).not.toBe(border("bad"));
  });

  it("shows a Stat's label, a number as it is and money as the organization writes it", () => {
    renderSurface(
      [
        { id: "root", component: "Row", children: ["count", "owed"] },
        { id: "count", component: "Stat", label: "Customers", value: { "@path": "/count" } },
        { id: "owed", component: "Stat", label: "Owed", value: { "@path": "/owed" }, format: "money" },
      ],
      { count: 42, owed: { minorUnits: 12500, currency: "USD" } },
    );
    expect(screen.getByText("Customers")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("$125.00")).toBeTruthy();
  });

  describe("Stat tone", () => {
    const numberColor = (stat: Record<string, unknown>, data: Record<string, unknown> = {}) => {
      renderSurface([{ id: "root", component: "Stat", label: "L", ...stat }], data);
      const color = getComputedStyle(document.querySelector(".chakra-stat__valueText") as HTMLElement).color;
      cleanup();
      return color;
    };
    const plain = numberColor({ value: 1 });

    it("colors a non-zero number: the palette's text for accent, red for danger", () => {
      const red = numberColor({ value: 1, tone: "danger" });
      expect(red).toBe("rgb(153, 25, 25)");
      expect(numberColor({ value: 3, tone: "accent" })).not.toBe(plain);
      expect(numberColor({ value: { "@path": "/n" }, tone: "danger" }, { n: 2 })).toBe(red);
    });

    it("leaves zero, nothing and zero money plain", () => {
      expect(numberColor({ value: 0, tone: "danger" })).toBe(plain);
      expect(numberColor({ value: { "@path": "/n" }, tone: "danger" }, { n: null })).toBe(plain);
      expect(numberColor({ value: { "@path": "/missing" }, tone: "danger" })).toBe(plain);
      const money = (minorUnits: number, tone?: string) =>
        numberColor({ value: { minorUnits, currency: "USD" }, format: "money", ...(tone ? { tone } : {}) });
      expect(money(0, "danger")).toBe(money(0));
      expect(money(500, "danger")).toBe("rgb(153, 25, 25)");
    });
  });

  describe("a Button in a Row", () => {
    const formWithRow = (rowExtra: Record<string, unknown> = {}, fieldExtra: Record<string, unknown> = {}) => [
      { id: "root", component: "Form", children: ["row"] },
      { id: "row", component: "Row", children: ["first", "last", "go"], ...rowExtra },
      { id: "first", component: "InputField", label: "First", value: { "@path": "/draft/first" }, ...fieldExtra },
      {
        id: "last",
        component: "InputField",
        label: "Last",
        value: { "@path": "/draft/last" },
        "@checks": [
          {
            condition: { "@call": "required", args: { value: { "@path": "/draft/last" } } },
            message: "Last is required",
          },
        ],
      },
      { id: "go", component: "Button", label: "Add", action: { event: { name: "add" } } },
    ];
    const data = { draft: { first: "", last: "" } };
    const slotOf = (id: string) => (byId(id) as HTMLElement).closest("[data-row-slot]") as HTMLElement;

    it.each([
      ["a Row that shares the width", {}, {}],
      ["a justified Row", { justify: "spaceBetween" }, {}],
      ["a Row where a field has a weight", {}, { weight: 3 }],
    ])("takes its own width and lines up with the field bottoms in %s", (_name, rowExtra, fieldExtra) => {
      const grow = "weight" in fieldExtra ? "3" : "justify" in rowExtra ? "0" : "1";
      renderSurface(formWithRow(rowExtra, fieldExtra), data);
      const slot = getComputedStyle(slotOf("go"));
      expect(slot.flexGrow).toBe("0");
      expect(slot.flexShrink).toBe("0");
      expect(slot.flexBasis).toBe("auto");
      expect(slot.alignSelf).toBe("flex-end");
      expect(getComputedStyle(slotOf("first")).alignSelf).not.toBe("flex-end");
      expect(getComputedStyle(slotOf("first")).flexGrow).toBe(grow);
    });

    it("lines up with the bottom of the inputs, not of the space each field keeps under its input for a message", () => {
      renderSurface(formWithRow(), data);
      const rules = rulesFor(byId("row") as HTMLElement);
      // The space under an input: the message line (minH 4) and the gap above it (1.5), as FormField draws them.
      expect(rules).toMatch(
        /:has\(\[data-field-message\]\)>\[data-row-button\]\{[^}]*margin-bottom:calc\(var\(--chakra-spacing-4\) \+ var\(--chakra-spacing-1\\\.5\)\)/,
      );
      expect(slotOf("go")).toHaveAttribute("data-row-button", "");
      expect(slotOf("first")).not.toHaveAttribute("data-row-button");
    });

    it("keeps that line-up while a field shows an error, since the message line is always there", async () => {
      renderSurface(formWithRow(), data);
      const line = (id: string) => slotOf(id).querySelector("[data-field-message]") as HTMLElement;
      expect(rulesFor(line("last"))).toMatch(/min-height:\s*var\(--chakra-sizes-4\)/);
      expect(rulesFor(line("last").parentElement as HTMLElement)).toMatch(/gap:\s*var\(--chakra-spacing-1\\\.5\)/);
      await userEvent.type(screen.getByLabelText("Last"), "L");
      await userEvent.clear(screen.getByLabelText("Last"));
      await userEvent.tab();
      expect(await screen.findByText("Last is required")).toBeTruthy();
      expect(line("last")).toBeTruthy();
      expect(rulesFor(line("last"))).toMatch(/min-height:\s*var\(--chakra-sizes-4\)/);
    });

    it("is right in the first committed render, before anything can paint", () => {
      const { element } = startSurface(
        [
          { id: "root", component: "Row", justify: "end", children: ["a", "go"] },
          { id: "a", component: "Text", text: "a", weight: 2 },
          { id: "go", component: "Button", label: "Add", action: { event: { name: "add" } } },
        ],
        {},
      );
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
      try {
        // flushSync renders what a layout effect asks for before it returns; a passive effect's update would wait.
        flushSync(() => root.render(<ThemeProvider>{element}</ThemeProvider>));
        const slot = (id: string) =>
          getComputedStyle(host.querySelector(`[data-component-id="${id}"]`)?.closest("[data-row-slot]") as Element);
        expect(slot("go").flexGrow).toBe("0");
        expect(slot("go").alignSelf).toBe("flex-end");
        expect(slot("a").flexGrow).toBe("2");
      } finally {
        flushSync(() => root.unmount());
        host.remove();
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
      }
    });

    it("follows the component when the agent turns the Button into text, and back", () => {
      const surface = renderSurface(formWithRow(), data);
      expect(getComputedStyle(slotOf("go")).alignSelf).toBe("flex-end");
      surface.update([{ id: "go", component: "Text", text: "Add" }]);
      expect(getComputedStyle(slotOf("go")).alignSelf).not.toBe("flex-end");
      expect(getComputedStyle(slotOf("go")).flexGrow).toBe("1");
      surface.update([{ id: "go", component: "Button", label: "Add", action: { event: { name: "add" } } }]);
      expect(getComputedStyle(slotOf("go")).alignSelf).toBe("flex-end");
    });

    it("leaves the Form's fields working", async () => {
      const surface = renderSurface(formWithRow(), data);
      await userEvent.type(screen.getByLabelText("First"), "Ann");
      await userEvent.type(screen.getByLabelText("Last"), "L");
      await userEvent.clear(screen.getByLabelText("Last"));
      await userEvent.tab();
      expect(surface.read("/draft/first")).toBe("Ann");
      expect(surface.read("/draft/last")).toBe("");
      expect(await screen.findByText("Last is required")).toBeTruthy();
    });
  });

  it("runs a Button's action, unless it is disabled, and is solid unless told otherwise", async () => {
    const seen: unknown[] = [];
    renderSurface(
      [
        { id: "root", component: "Column", children: ["go", "same", "byDefault", "no"] },
        { id: "go", component: "Button", label: "Go", variant: "outline", action: { event: { name: "go" } } },
        { id: "same", component: "Button", label: "Same", variant: "solid", action: { event: { name: "same" } } },
        { id: "byDefault", component: "Button", label: "Default", action: { event: { name: "default" } } },
        { id: "no", component: "Button", label: "No", disabled: true, action: { event: { name: "no" } } },
      ],
      {},
      (action) => seen.push(action),
    );
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByRole("button", { name: "No" }).hasAttribute("disabled")).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ name: "go" });
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(seen).toHaveLength(1);
    expect(classOf("same")).toBe(classOf("byDefault"));
    expect(classOf("go")).not.toBe(classOf("same"));
  });

  it("follows a component's weight when the agent changes it", () => {
    const surface = renderSurface([
      { id: "root", component: "Row", children: ["a"] },
      { id: "a", component: "Text", text: "a", weight: 2 },
    ]);
    const slot = (byId("root") as HTMLElement).children[0] as HTMLElement;
    expect(getComputedStyle(slot).flexGrow).toBe("2");
    surface.update([{ id: "a", component: "Text", text: "a", weight: 3 }]);
    expect(getComputedStyle(slot).flexGrow).toBe("3");
  });
});

describe("useComponentId", () => {
  it("says to build the component with defineComponent when there is no id", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useComponentId())).toThrow("defineComponent");
  });
});

describe("formatValue", () => {
  it("writes each value as its format says", () => {
    expect(formatValue(undefined)).toBe("");
    expect(formatValue(null, "money")).toBe("");
    expect(formatValue({ minorUnits: 12500, currency: "USD" }, "money")).toBe("$125.00");
    expect(formatValue("2026-12-01", "date")).toBe("Dec 1, 2026");
    expect(formatValue("10:30", "time")).toBe("10:30 AM");
    expect(formatValue(["a", 2], "list")).toBe("a, 2");
  });

  it("writes a value its format does not fit as plain text", () => {
    expect(formatValue("hello")).toBe("hello");
    expect(formatValue(7)).toBe("7");
    expect(formatValue(false)).toBe("false");
    expect(formatValue({ not: "text" })).toBe("");
    expect(formatValue("x", "money")).toBe("x");
    expect(formatValue("2026-12-01")).toBe("2026-12-01");
    expect(formatValue("2026-12-01", "time")).toBe("2026-12-01");
    expect(formatValue("10:30")).toBe("10:30");
    expect(formatValue("10:30", "date")).toBe("10:30");
    expect(formatValue(5, "date")).toBe("5");
    expect(formatValue(5, "time")).toBe("5");
    expect(formatValue("a, b", "list")).toBe("a, b");
    expect(formatValue(["a", "b"])).toBe("");
  });
});

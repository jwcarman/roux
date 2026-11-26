// @vitest-environment jsdom
import { cleanup, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatValue, useComponentId } from "./layout";
import { pageOf } from "../../testing";
import { renderSurface } from "../testSurface";

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

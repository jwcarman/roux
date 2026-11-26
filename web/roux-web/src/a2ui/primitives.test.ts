import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { z } from "zod3";
import { CATALOG_ID, CATALOG_VERSION, PRIMITIVES, rouxCatalog } from "./primitives";

/** tasting's catalog before the typed format, as web_core wrote it: what the primitives must still be. */
const golden = JSON.parse(readFileSync(new URL("./testdata/tasting-catalog.json", import.meta.url), "utf8")) as {
  components: Record<string, { properties: Record<string, unknown> }>;
};

/** tasting's component descriptions before the typed format. */
const descriptions = JSON.parse(
  readFileSync(new URL("./testdata/tasting-descriptions.json", import.meta.url), "utf8"),
) as Record<string, string>;

type Components = Record<string, { properties: Record<string, unknown> }>;

/** The document without what the typed format added: Row and Column's justify and align, every weight. */
function withoutAdditions(document: Record<string, unknown>): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(document).filter(([key]) => key !== "metadata"));
  const components = structuredClone(rest.components) as Components;
  for (const [name, schema] of Object.entries(components)) {
    delete schema.properties.weight;
    if (name === "Row" || name === "Column") {
      delete schema.properties.justify;
      delete schema.properties.align;
    }
  }
  return { ...rest, components };
}

const accepts = (name: string, props: unknown) =>
  (rouxCatalog.apis[name as keyof typeof rouxCatalog.apis].schema as unknown as z.ZodTypeAny).safeParse(props).success;

describe("roux's primitives", () => {
  it("are tasting's catalog, plus Row and Column's layout and a child's weight", () => {
    expect(withoutAdditions(rouxCatalog.document)).toEqual(golden);
  });

  it("are listed in the prompt's order", () => {
    expect(PRIMITIVES.map((def) => def.name)).toEqual(Object.keys(golden.components));
    expect(rouxCatalog.catalog().id).toBe(CATALOG_ID);
    expect(CATALOG_VERSION).toBe("0.1.0");
  });

  it("keep tasting's descriptions, with Row and Column's layout explained", () => {
    const described = Object.fromEntries(rouxCatalog.promptEntries.map((entry) => [entry.name, entry.description]));
    expect({ ...described, Row: descriptions.Row, Column: descriptions.Column }).toEqual(descriptions);
    expect(described.Column).toBe(
      "Stacks its children vertically. The usual root of a screen. " +
        "justify places the children along the column (spaceBetween pushes them to the top and bottom); align lines " +
        "them up across it. A child's weight (1, 2, ...) gives it that many shares of the spare height.",
    );
    expect(described.Row).toBe(
      "Lays its children side by side; wraps on narrow screens. Children share the width equally, unless justify is " +
        "set: then each takes its own width and justify places them (end for buttons on the right, spaceBetween to " +
        "push them to the edges). align lines them up vertically. A child's weight (1, 2, ...) gives it that many " +
        "shares of the width.",
    );
  });

  it("offer the basic catalog's justify and align values", () => {
    const components = rouxCatalog.document.components as Components;
    for (const name of ["Row", "Column"]) {
      expect(components[name].properties.justify).toEqual({
        type: "string",
        enum: ["start", "center", "end", "spaceBetween", "spaceAround", "spaceEvenly", "stretch"],
      });
      expect(components[name].properties.align).toEqual({
        type: "string",
        enum: ["start", "center", "end", "stretch"],
      });
      expect(components[name].properties.weight).toEqual({ type: "number" });
    }
  });

  it("lay out a Row or Column with justify, align and weighted children", () => {
    for (const name of ["Row", "Column"]) {
      expect(accepts(name, { children: ["a"], justify: "spaceBetween", align: "center" })).toBe(true);
      expect(accepts(name, { children: ["a"], justify: "around" })).toBe(false);
      expect(accepts(name, { children: ["a"], align: "spaceBetween" })).toBe(false);
    }
    for (const def of PRIMITIVES) {
      expect(rouxCatalog.document.components).toHaveProperty([def.name, "properties", "weight"]);
    }
    expect(accepts("Heading", { text: "Jobs", weight: 2 })).toBe(true);
  });

  it("repeat a template for each item of a list", () => {
    const template = { path: "/jobs", componentId: "jobCard" };
    for (const name of ["Row", "Column", "Card", "Form"]) {
      expect(accepts(name, { children: template })).toBe(true);
    }
  });

  it("carry their typing for later checks", () => {
    const roux = (rouxCatalog.document.metadata as { extensions: { roux: { components: typeof PRIMITIVES } } })
      .extensions.roux;
    const table = roux.components.find((def) => def.name === "DataTable");
    expect(table?.generics).toEqual(["T"]);
    const typing = Object.fromEntries(roux.components.map((def) => [def.name, [def.generics, def.rules]]));
    expect(typing.Stat).toEqual([["V"], ["value is money when format is money, otherwise a number"]]);
    expect(typing.DataTable).toEqual([
      ["T"],
      ["a column's format fits its field's type: money for a money field, date for a date field"],
    ]);
    expect(typing.CardList).toEqual([
      ["T"],
      ["a line's format fits its field's type: money for a money field, date for a date field"],
    ]);
    expect(table?.props.rows).toEqual({
      kind: "bindable",
      type: { kind: "list", of: { kind: "param", name: "T" } },
      optional: false,
    });
  });
});

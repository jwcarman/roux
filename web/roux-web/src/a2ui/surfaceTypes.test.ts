import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  array,
  bindable,
  component,
  date,
  map,
  money,
  number,
  optional,
  options,
  record,
  text,
  boolean,
  email,
  fieldOf,
  id,
  integer,
  phone,
  time,
  url,
  list,
  literal,
  oneOf,
  param,
  type ComponentDef,
} from "./builder";
import { PRIMITIVES } from "./primitives";
import { surfaceTypes, type SurfaceComponent, type SurfaceJson } from "./surfaceTypes";

const at = (path: string) => ({ "@path": path });
const column = (id: string, children: string[]): SurfaceComponent => ({ id, component: "Column", children });
const table = (id: string, columns: unknown[], rows = "/rows"): SurfaceComponent => ({
  id,
  component: "DataTable",
  rows: at(rows),
  columns,
});
const surface = (...components: SurfaceComponent[]): SurfaceJson => ({ id: "demo", components });
const types = (...components: SurfaceComponent[]) => surfaceTypes(surface(...components), PRIMITIVES);
const rowsOf = (columns: unknown[]) => types(column("root", ["t"]), table("t", columns));

describe("surfaceTypes", () => {
  it("typesTheItemsSurface", () => {
    const read = (name: string) => readFileSync(new URL(`testdata/${name}`, import.meta.url), "utf8");
    const items = JSON.parse(read("items.surface.json")) as SurfaceJson;
    expect(surfaceTypes(items, PRIMITIVES)).toBe(read("items.surface.gen.ts"));
  });

  it("aColumnFieldIsNullable", () => {
    expect(rowsOf([{ header: "Name", field: "name" }])).toContain("      name: string | null;\n");
  });

  it("aFormatTypesItsField", () => {
    const out = rowsOf([
      { header: "D", field: "d", format: "date" },
      { header: "M", field: "m", format: "money" },
      { header: "T", field: "t", format: "time" },
      { header: "L", field: "l", format: "list" },
      { header: "B", field: "b", format: "badge" },
      { header: "X", field: "x", format: "text" },
    ]);
    for (const line of [
      "d: IsoDate | null;",
      "m: Money | null;",
      "t: string | null;",
      "l: string[];",
      "b: string | null;",
      "x: string | null;",
    ]) {
      expect(out).toContain(`      ${line}\n`);
    }
  });

  it("aLinkParamIsAStringField", () => {
    const out = rowsOf([{ header: "N", field: "n", link: { to: "/x/$k", params: { k: "key" } } }]);
    expect(out).toContain("      n: string | null;\n      key: string;\n");
  });

  it("aLinkParamNarrowsANullableColumn", () => {
    const out = rowsOf([{ header: "N", field: "n", link: { to: "/x/$k", params: { k: "n" } } }]);
    expect(out).toContain("      n: string;\n");
    expect(out).not.toContain("null");
  });

  it("aCardListTypesItsFields", () => {
    const out = types(column("root", ["c"]), {
      id: "c",
      component: "CardList",
      rows: at("/cards"),
      title: "name",
      lines: [{ field: "owed", format: "money" }],
      badge: { field: "state" },
    });
    expect(out).toContain("      name: string;\n      owed: Money | null;\n      state: string | null;\n");
  });

  it("aStatTakesItsFormat", () => {
    const stat = (id: string, path: string, format?: string): SurfaceComponent => ({
      id,
      component: "Stat",
      label: "L",
      value: at(path),
      ...(format === undefined ? {} : { format }),
    });
    const out = types(column("root", ["a", "b"]), stat("a", "/owed", "money"), stat("b", "/count"));
    expect(out).toContain("  owed: Money;\n  count: number;\n");
    expect(types(column("root", ["a"]), stat("a", "/n", "number"))).toContain("  n: number;\n");
  });

  it("aBoundFlagAndAMapAreTyped", () => {
    const out = types(
      column("root", ["b", "t"]),
      {
        id: "b",
        component: "Button",
        label: "Go",
        disabled: at("/busy"),
        action: { event: { name: "go" } },
      },
      table("t", [{ header: "S", field: "s", tones: { Done: "success" } }]),
    );
    expect(out).toContain("  busy: boolean;\n");
    expect(out).toContain("  go: Record<string, never>;\n");
  });

  it("anEventIsTypedByItsContext", () => {
    const out = types(
      column("root", ["name", "go"]),
      { id: "name", component: "InputField", label: "N", value: at("/draft/name") },
      {
        id: "go",
        component: "Button",
        label: "Go",
        action: {
          event: {
            name: "save",
            context: {
              name: at("/draft/name"),
              fixed: "x",
              count: 2,
              on: true,
              odd: null,
            },
          },
        },
      },
    );
    expect(out).toContain(
      "export interface DemoSurfaceEvents {\n  save: {\n    name: string;\n    fixed: string;\n    count: number;\n    on: boolean;\n    odd: unknown;\n  };\n}\n",
    );
  });

  it("anEventContextReadingAnUntypedPathIsAnError", () => {
    const name = { id: "name", component: "InputField", label: "N", value: at("/draft/name") };
    const send = (path: string): SurfaceComponent => ({
      id: "go",
      component: "Button",
      label: "Go",
      action: { event: { name: "save", context: { x: at(path) } } },
    });
    for (const path of ["/draft/nme", "/nowhere/deeper", "/draft/name/x"]) {
      expect(() => types(column("root", ["name", "go"]), name, send(path))).toThrow(
        `save's context reads ${path}, which nothing on the surface shows or edits; bind it to a path a component uses.`,
      );
    }
  });

  it("onlyTheTypesTheTextUsesAreImported", () => {
    const first = (out: string) => out.split("\n")[1];
    const input = { id: "i", component: "InputField", label: "D", value: at("/a") };
    expect(first(types(column("root", ["i"]), input))).toBe("");
    expect(first(rowsOf([{ header: "M", field: "m", format: "money" }]))).toBe(
      'import type { Money, Pagination } from "@jwcarman/roux-web/surface";',
    );
    expect(first(rowsOf([{ header: "D", field: "d", format: "date" }]))).toBe(
      'import type { IsoDate, Pagination } from "@jwcarman/roux-web/surface";',
    );
    const stat = { id: "s", component: "Stat", label: "S", value: at("/s"), format: "money" };
    expect(first(types(column("root", ["s"]), stat))).toBe('import type { Money } from "@jwcarman/roux-web/surface";');
  });

  it("anEventNameUsedWithTwoContextsIsAnError", () => {
    const button = (id: string, context: unknown): SurfaceComponent => ({
      id,
      component: "Button",
      label: "Go",
      action: { event: { name: "save", context } },
    });
    expect(() => types(column("root", ["a", "b"]), button("a", { x: "1" }), button("b", { x: 1 }))).toThrow(
      "save is sent with different contexts in different places; give each its own event name.",
    );
    expect(() => types(column("root", ["a", "b"]), button("a", { x: "1" }), button("b", { x: "1" }))).not.toThrow();
  });

  it("aPathUsedAsTwoTypesIsAnError", () => {
    const input = { id: "i", component: "InputField", label: "D", value: at("/draft/day") };
    const stat = { id: "s", component: "Stat", label: "D", value: at("/draft/day") };
    expect(() => types(column("root", ["i", "s"]), input, stat)).toThrow(
      "/draft/day is used as string in one place and number in another.",
    );
  });

  it("aPathUsedAsALeafAndAnObjectIsAnError", () => {
    const input = { id: "i", component: "InputField", label: "D", value: at("/a") };
    const deeper = { id: "j", component: "InputField", label: "D", value: at("/a/b") };
    expect(() => types(column("root", ["i", "j"]), input, deeper)).toThrow(
      /^\/a is used as string in one place and \{\n {2}b: string;\n\} in another\.$/,
    );
  });

  it("aTableFieldUsedAsTwoTypesIsAnError", () => {
    const clash = () =>
      types(
        column("root", ["a", "b"]),
        table("a", [{ header: "X", field: "x", format: "date" }]),
        table("b", [{ header: "X", field: "x", format: "money" }]),
      );
    expect(clash).toThrow("/rows/data/*/x is used as IsoDate | null in one place and Money | null in another.");
  });

  it("twoTablesOnOnePathMergeTheirFields", () => {
    const out = types(
      column("root", ["a", "b"]),
      table("a", [{ header: "X", field: "x" }]),
      table("b", [
        { header: "X", field: "x" },
        { header: "Y", field: "y" },
      ]),
    );
    expect(out).toContain("      x: string | null;\n      y: string | null;\n");
  });

  it("anUnknownFormatTypesItsFieldAsText", () => {
    expect(rowsOf([{ header: "H", field: "h", format: "html" }])).toContain("      h: string | null;\n");
  });

  it("aPathOfNoKeysIsAnError", () => {
    const input = { id: "i", component: "InputField", label: "D", value: at("/") };
    expect(() => types(column("root", ["i"]), input)).toThrow(
      'i binds value to "/", which names nothing; use a path like "/name".',
    );
  });

  it("anActionThatIsNotAnEventIsIgnored", () => {
    for (const action of ["go", {}, { event: "go" }, { event: {} }]) {
      const button = { id: "b", component: "Button", label: "Go", action };
      expect(types(column("root", ["b"]), button)).toContain("export type DemoSurfaceEvents = Record<string, never>;");
    }
  });

  it("childrenThatAreNeitherAListNorATemplateAreIgnored", () => {
    expect(types({ id: "root", component: "Column", children: {} })).toContain("Record<string, never>");
  });

  it("anUnknownComponentIsAnError", () => {
    expect(() => types(column("root", ["table1"]), { id: "table1", component: "Grid" })).toThrow(
      'table1 is a "Grid", which the catalog doesn\'t define.',
    );
  });

  it("anUnknownChildIsAnError", () => {
    expect(() => types(column("root", ["ghost"]))).toThrow(
      'root lists the child "ghost", which the surface doesn\'t define.',
    );
  });

  it("anIdThatIsNotAWordIsAnError", () => {
    for (const id of ["", "my-items", "1st"]) {
      expect(() => surfaceTypes({ id, components: [] }, PRIMITIVES)).toThrow(
        `Surface id "${id}" must be letters and digits, starting with a letter.`,
      );
    }
  });

  it("aBoundCompoundValueIsTyped", () => {
    const probe = component("Probe")
      .prop("rec", bindable(record({ a: text, b: optional(number) })))
      .prop("tones", bindable(map(money)))
      .prop("days", bindable(array(date)))
      .prop("choices", bindable(options(text)))
      .describe("A probe.")
      .build();
    const out = surfaceTypes(
      {
        id: "demo",
        components: [
          {
            id: "root",
            component: "Probe",
            rec: at("/rec"),
            tones: at("/tones"),
            days: at("/days"),
            choices: at("/choices"),
          },
        ],
      },
      [probe],
    );
    expect(out).toContain(
      "  rec: {\n    a: string;\n    b: number;\n  };\n  tones: Record<string, Money>;\n  days: IsoDate[];\n" +
        "  choices: {\n    value: string;\n    label: string;\n  }[];\n",
    );
  });

  it("aTypeParameterTakesOnlyItsOwnFields", () => {
    const A = param("A");
    const B = param("B");
    const two = component("Two")
      .generic(A)
      .generic(B)
      .prop("rows", bindable(list(A)))
      .prop("first", literal(fieldOf(A)))
      .prop("second", literal(fieldOf(B)))
      .prop("third", optional(literal(fieldOf(A))))
      .prop("many", optional(literal(array(fieldOf(A)))))
      .describe("Two parameters.")
      .build();
    const out = surfaceTypes(
      { id: "demo", components: [{ id: "root", component: "Two", rows: at("/rows"), first: "a", second: "b" }] },
      [two],
    );
    expect(out).toContain("    data: {\n      a: string;\n    }[];\n");
  });

  it("everyScalarHasItsType", () => {
    const names = ["text", "email", "url", "phone", "id", "time", "date", "number", "integer", "boolean", "money"];
    const defs = { text, email, url, phone, id, time, date, number, integer, boolean, money };
    let probe = component("Probe").describe("Every scalar.");
    for (const name of names) probe = probe.prop(name, bindable(defs[name as keyof typeof defs]));
    const bound = Object.fromEntries(names.map((name) => [name, at(`/${name}`)]));
    const out = surfaceTypes({ id: "demo", components: [{ id: "root", component: "Probe", ...bound }] }, [
      probe.build(),
    ]);
    const types_ = [
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "IsoDate",
      "number",
      "number",
      "boolean",
      "Money",
    ];
    for (const [i, name] of names.entries()) expect(out).toContain(`  ${name}: ${types_[i]};\n`);
  });

  it("aMapOfRecordsIsIndentedWhereItSits", () => {
    const probe = component("Probe")
      .prop("deep", bindable(map(record({ a: text }))))
      .describe("A map of records.")
      .build();
    const out = surfaceTypes({ id: "demo", components: [{ id: "root", component: "Probe", deep: at("/x/y") }] }, [
      probe,
    ]);
    expect(out).toContain("  x: {\n    y: Record<string, {\n      a: string;\n    }>;\n  };\n");
  });

  it("twoBoundMapsAndArraysMergeAndClash", () => {
    const probe = component("Probe")
      .prop("m", bindable(map(text)))
      .prop("n", bindable(map(text)))
      .prop("a", bindable(array(date)))
      .prop("b", bindable(array(date)))
      .prop("t", optional(bindable(text)))
      .describe("Same paths.")
      .build();
    const make = (props: Record<string, unknown>) =>
      surfaceTypes({ id: "demo", components: [{ id: "root", component: "Probe", ...props }] }, [probe]);
    const same = make({ m: at("/p"), n: at("/p"), a: at("/q"), b: at("/q") });
    expect(same).toContain("  p: Record<string, string>;\n  q: IsoDate[];\n");
    expect(() => make({ m: at("/p"), n: at("/p/k") })).toThrow(
      /^\/p is used as Record<string, string> in one place and \{\n {2}k: Record<string, string>;\n\} in another\.$/,
    );
    expect(() => make({ a: at("/q"), t: at("/q") })).toThrow(
      "/q is used as IsoDate[] in one place and string in another.",
    );
    expect(() => make({ a: at("/q"), b: at("/q/z") })).toThrow(/^\/q is used as IsoDate\[\] in one place and \{/);
  });

  it("anObjectBeforeALeafIsAnError", () => {
    const deeper = { id: "j", component: "InputField", label: "D", value: at("/a/b") };
    const input = { id: "i", component: "InputField", label: "D", value: at("/a") };
    expect(() => types(column("root", ["j", "i"]), deeper, input)).toThrow(
      /^\/a is used as \{\n {2}b: string;\n\} in one place and string in another\.$/,
    );
  });

  it("aFieldShownInTwoFormatsIsAnErrorWhichEverComesFirst", () => {
    expect(() =>
      rowsOf([
        { header: "A", field: "x", format: "money" },
        { header: "B", field: "x", format: "date" },
      ]),
    ).toThrow('t uses the field "x" as Money | null in one place and IsoDate | null in another.');
  });

  it("aFieldShownInTwoFormatsIsAnError", () => {
    expect(() =>
      rowsOf([
        { header: "A", field: "x", format: "date" },
        { header: "B", field: "x", format: "money" },
      ]),
    ).toThrow('t uses the field "x" as IsoDate | null in one place and Money | null in another.');
  });

  it("aLinkParamStaysAStringWhateverTheOrder", () => {
    const link = { to: "/x/$k", params: { k: "x" } };
    const first = rowsOf([
      { header: "A", field: "a", link },
      { header: "X", field: "x" },
    ]);
    const second = rowsOf([
      { header: "X", field: "x" },
      { header: "A", field: "a", link },
    ]);
    for (const out of [first, second]) expect(out).toContain("      x: string;\n");
  });

  it("aCellFieldMayBeOptionalInItsRecord", () => {
    const A = param("A");
    const cells = component("Cells")
      .generic(A)
      .prop("rows", bindable(list(A)))
      .prop("cells", literal(array(record({ field: optional(fieldOf(A)), format: optional(oneOf(["date"])) }))))
      .describe("Cells.")
      .build();
    const out = surfaceTypes(
      {
        id: "demo",
        components: [{ id: "root", component: "Cells", rows: at("/r"), cells: [{ field: "d", format: "date" }] }],
      },
      [cells],
    );
    expect(out).toContain("      d: IsoDate | null;\n");
  });

  it("aBindingOnAPropThatCannotTakeOneIsIgnored", () => {
    const A = param("A");
    const odd = component("Odd")
      .generic(A)
      .prop("rows", bindable(list(A)))
      .prop("named", bindable(fieldOf(A)))
      .prop("size", optional(literal(text)))
      .describe("Odd.")
      .build();
    const out = surfaceTypes(
      {
        id: "demo",
        components: [
          // `named` holds a plain string: not a field of the rows. `size` is literal, so its binding is no path.
          { id: "root", component: "Odd", rows: at("/r"), named: "name", size: at("/ignored") },
          { id: "other", component: "Heading", text: { event: { name: "ghost" } } },
        ],
      },
      [odd, ...PRIMITIVES],
    );
    expect(out).toContain("  r: {\n    data: number[];");
    expect(out).not.toContain("ignored");
    expect(out).not.toContain("ghost");
    const bound = surfaceTypes(
      { id: "demo", components: [{ id: "root", component: "Odd", rows: at("/r"), named: at("/n") }] },
      [odd],
    );
    expect(bound).toContain("  n: string;\n");
  });

  it("aSurfaceBindingNothingHasEmptyTypes", () => {
    expect(surfaceTypes({ id: "plain", components: [] }, PRIMITIVES)).toBe(
      [
        "// Generated from plain.surface.json and the typed catalog. Do not edit.",
        "",
        "/** What the plain surface shows, by top-level path: each is bound to a query or kept locally. */",
        "export type PlainSurfaceData = Record<string, never>;",
        "",
        "/** What each of the plain surface's events carries. */",
        "export type PlainSurfaceEvents = Record<string, never>;",
        "",
      ].join("\n"),
    );
  });

  it("aPathNeedsNoNestingToBeQuoted", () => {
    const input = { id: "i", component: "InputField", label: "D", value: at("/a-b/9") };
    expect(types(column("root", ["i"]), input)).toContain('  "a-b": {\n    "9": string;\n  };\n');
  });

  // Fields follow first use walking the tree from the root, so a child counts where its parent puts it: each of
  // these puts the wanted component ahead of "early", which sits before it in the file.
  const early = { id: "early", component: "Stat", label: "E", value: at("/early") };
  const wanted = { id: "wanted", component: "Stat", label: "W", value: at("/wanted") };
  const firstIsWanted = (out: string) => expect(out.indexOf("wanted")).toBeLessThan(out.indexOf("early"));

  it("aListedChildIsFollowedInOrder", () => {
    firstIsWanted(types(column("root", ["wanted", "early"]), early, wanted));
  });

  it("aTemplateChildIsFollowed", () => {
    const template = { id: "root", component: "Column", children: { componentId: "wanted", path: "/xs" } };
    firstIsWanted(types(template, early, wanted));
  });

  it("aSingleChildIsFollowed", () => {
    const props: ComponentDef["props"] = { content: { kind: "child", optional: false } };
    const wrap = { ...PRIMITIVES[0], name: "Wrap", props };
    const out = surfaceTypes(
      { id: "demo", components: [{ id: "root", component: "Wrap", content: "wanted" }, early, wanted] },
      [wrap, ...PRIMITIVES],
    );
    firstIsWanted(out);
  });

  it("aChildThatIsNotAnIdIsIgnored", () => {
    expect(() => types(column("root", [1, "wanted"] as unknown as string[]), wanted)).not.toThrow();
    const props: ComponentDef["props"] = { content: { kind: "child", optional: false } };
    const wrap = { ...PRIMITIVES[0], name: "Wrap", props };
    const loose = { id: "root", component: "Wrap", content: 1 };
    expect(() => surfaceTypes({ id: "demo", components: [loose] }, [wrap])).not.toThrow();
  });

  it("aPropThatIsNotChildrenIsNotFollowed", () => {
    // These strings and objects are words a component shows, not child ids: none may be read as one.
    const labels = component("Labels")
      .prop("words", literal(array(text)))
      .prop("template", literal(record({ componentId: text })))
      .describe("Words.")
      .build();
    const root = { id: "root", component: "Labels", words: ["ghost"], template: { componentId: "ghost" } };
    expect(() => surfaceTypes({ id: "demo", components: [root] }, [labels])).not.toThrow();
  });

  it("aDeepPathNestsInOrder", () => {
    const input = { id: "i", component: "InputField", label: "D", value: at("/a/b/c") };
    expect(types(column("root", ["i"]), input)).toContain("  a: {\n    b: {\n      c: string;\n    };\n  };\n");
  });

  it("twoTablesMergeANullableFieldWithARequiredOne", () => {
    const out = types(
      column("root", ["a", "b"]),
      table("a", [{ header: "X", field: "x" }]),
      table("b", [{ header: "N", field: "n", link: { to: "/n/$k", params: { k: "x" } } }]),
    );
    expect(out).toContain("      x: string;\n      n: string | null;\n");
  });

  it("aMapOfOnePathHoldingTwoTypesIsAnError", () => {
    const probe = component("Probe")
      .prop("m", bindable(map(text)))
      .prop("d", bindable(map(date)))
      .describe("Maps.")
      .build();
    const root = { id: "root", component: "Probe", m: at("/p"), d: at("/p") };
    expect(() => surfaceTypes({ id: "demo", components: [root] }, [probe])).toThrow(
      "/p/* is used as string in one place and IsoDate in another.",
    );
  });

  it("aLeafAndAnArrayOrMapOnOnePathIsAnError", () => {
    const probe = component("Probe")
      .prop("t", optional(bindable(text)))
      .prop("a", optional(bindable(array(date))))
      .prop("m", optional(bindable(map(text))))
      .describe("Same paths.")
      .build();
    const two = (first: Record<string, unknown>, second: Record<string, unknown>) =>
      surfaceTypes(
        {
          id: "demo",
          components: [
            { id: "root", component: "Probe", ...first, children: ["next"] },
            { id: "next", component: "Probe", ...second },
          ],
        },
        [{ ...probe, props: { ...probe.props, children: { kind: "children", optional: true } } }],
      );
    expect(() => two({ t: at("/q") }, { a: at("/q") })).toThrow(
      "/q is used as string in one place and IsoDate[] in another.",
    );
    expect(() => two({ t: at("/q") }, { m: at("/q") })).toThrow(
      "/q is used as string in one place and Record<string, string> in another.",
    );
    expect(() => two({ a: at("/q") }, { m: at("/q") })).toThrow(
      "/q is used as IsoDate[] in one place and Record<string, string> in another.",
    );
    expect(() => two({ m: at("/q") }, { a: at("/q") })).toThrow(
      "/q is used as Record<string, string> in one place and IsoDate[] in another.",
    );
  });

  it("aComponentNoOneReachesIsStillTyped", () => {
    const orphan = { id: "lost", component: "Stat", label: "L", value: at("/lost") };
    expect(types(column("root", []), orphan)).toContain("  lost: number;\n");
    expect(types(orphan)).toContain("  lost: number;\n");
  });

  it("aCycleOfChildrenTerminates", () => {
    const a = column("a", ["b"]);
    const b = column("b", ["a"]);
    expect(() => types(a, b)).not.toThrow();
  });
});

describe("the output is stable", () => {
  const input = (id: string, path: string): SurfaceComponent => ({
    id,
    component: "InputField",
    label: id,
    value: at(path),
  });

  it("theOutputIsStable", () => {
    const parts = [input("a", "/first/x"), input("b", "/second/y")];
    const forward = types(column("root", ["a", "b"]), ...parts);
    expect(types(column("root", ["a", "b"]), ...parts)).toBe(forward);
    expect(forward.indexOf("first")).toBeLessThan(forward.indexOf("second"));

    const reordered = types(column("root", ["b", "a"]), ...parts);
    expect(reordered.indexOf("second")).toBeLessThan(reordered.indexOf("first"));
    // Where a component sits in the file changes nothing: fields follow first use in the tree.
    expect(types(...[...parts].reverse(), column("root", ["a", "b"]))).toBe(forward);
  });

  it("fieldsFollowTheirColumnsOrder", () => {
    const out = rowsOf([
      { header: "B", field: "b" },
      { header: "A", field: "a" },
    ]);
    expect(out.indexOf("b: string")).toBeLessThan(out.indexOf("a: string"));
  });
});

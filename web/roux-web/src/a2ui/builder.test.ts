import type { Action, ChildList, DynamicNumber, DynamicString, DynamicValue } from "@a2ui/web_core/v1_0";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  array,
  bindable,
  boolean,
  checks,
  child,
  children,
  component,
  date,
  email,
  event,
  fieldOf,
  id,
  integer,
  list,
  literal,
  map,
  money,
  number,
  oneOf,
  optional,
  options,
  param,
  phone,
  record,
  text,
  time,
  url,
  type ChildPropsOf,
  type PropsOf,
} from "./builder";
import type { Type } from "./types";

describe("types", () => {
  it("names each scalar after its rule", () => {
    expect([text, email, url, phone, date, time, number, integer, money, id, boolean]).toEqual(
      ["text", "email", "url", "phone", "date", "time", "number", "integer", "money", "id", "boolean"].map(
        (scalar) => ({
          kind: "scalar",
          scalar,
        }),
      ),
    );
  });

  it("builds compound types as plain data", () => {
    const T = param("T");
    expect(oneOf(["a", "b"])).toEqual({ kind: "oneOf", values: ["a", "b"] });
    expect(record({ name: text })).toStrictEqual({ kind: "record", fields: { name: text } });
    expect(record({ name: text }, "Customer")).toEqual({ kind: "record", fields: { name: text }, name: "Customer" });
    expect(map(text)).toEqual({ kind: "map", of: text });
    expect(list(T)).toEqual({ kind: "list", of: { kind: "param", name: "T" } });
    expect(options(text)).toEqual({ kind: "options", of: text });
    expect(array(text)).toEqual({ kind: "array", of: text });
    expect(fieldOf(T)).toEqual({ kind: "fieldOf", param: "T" });
    expect(optional(text)).toEqual({ kind: "optional", of: text });
  });

  it("gives each type its A2UI value", () => {
    expectTypeOf(record({ name: text, phone: optional(phone), total: money })).toEqualTypeOf<
      Type<{ name: string; total: { minorUnits: number; currency: string }; phone?: string }>
    >();
    expectTypeOf(oneOf(["sm", "md"])).toEqualTypeOf<Type<"sm" | "md">>();
  });
});

describe("props", () => {
  it("builds each kind as plain data", () => {
    expect(bindable(text)).toEqual({ kind: "bindable", type: text, optional: false });
    expect(literal(number)).toEqual({ kind: "literal", type: number, optional: false });
    expect(event()).toEqual({ kind: "event", optional: false });
    expect(children()).toEqual({ kind: "children", optional: false });
    expect(child()).toEqual({ kind: "child", optional: false });
    expect(checks()).toEqual({ kind: "checks", optional: true });
    expect(optional(literal(number))).toEqual({ kind: "literal", type: number, optional: true });
  });
});

describe("component", () => {
  const T = param("T");
  const table = component("DataTable")
    .generic(T)
    .prop("rows", bindable(list(T)))
    .prop(
      "columns",
      literal(array(record({ header: text, field: fieldOf(T), format: optional(oneOf(["text", "date"])) }))),
    )
    .prop("title", optional(bindable(text)))
    .prop("onPick", event())
    .childProp("weight", optional(literal(number)))
    .rule("a column's format fits its field's type")
    .describe("A table.")
    .build();

  it("is plain data", () => {
    expect(table).toEqual({
      name: "DataTable",
      description: "A table.",
      generics: ["T"],
      props: {
        rows: { kind: "bindable", type: { kind: "list", of: { kind: "param", name: "T" } }, optional: false },
        columns: {
          kind: "literal",
          type: {
            kind: "array",
            of: {
              kind: "record",
              fields: {
                header: text,
                field: { kind: "fieldOf", param: "T" },
                format: { kind: "optional", of: { kind: "oneOf", values: ["text", "date"] } },
              },
            },
          },
          optional: false,
        },
        title: { kind: "bindable", type: text, optional: true },
        onPick: { kind: "event", optional: false },
      },
      childProps: { weight: { kind: "literal", type: number, optional: true } },
      rules: ["a column's format fits its field's type"],
    });
  });

  it("types the props its renderer receives", () => {
    expectTypeOf<PropsOf<typeof table>>().toEqualTypeOf<{
      rows: DynamicValue;
      columns: { header: string; field: string; format?: "text" | "date" }[];
      title?: DynamicString;
      onPick: Action;
    }>();
    expectTypeOf<ChildPropsOf<typeof table>>().toEqualTypeOf<{ weight?: number }>();
  });

  it("types bound numbers and children", () => {
    const stat = component("Stat").prop("value", bindable(integer)).prop("children", children()).describe("x").build();
    expectTypeOf<PropsOf<typeof stat>>().toEqualTypeOf<{ value: DynamicNumber; children: ChildList }>();
    expect(stat.name).toBe("Stat");
  });

  it("refuses a field of an undeclared type parameter", () => {
    const U = param("U");
    expect(() =>
      component("Grid")
        .prop("field", literal(fieldOf(U)))
        .describe("x")
        .build(),
    ).toThrow('fieldOf(U): Grid declares no type parameter "U"; add .generic(param("U")) before using it.');
  });

  it("refuses an undeclared type parameter anywhere in a type", () => {
    const U = param("U");
    const cases = [
      bindable(U),
      bindable(list(U)),
      bindable(map(U)),
      bindable(options(U)),
      literal(array(U)),
      literal(optional(U)),
      literal(record({ inner: U })),
    ];
    for (const prop of cases) {
      expect(() => component("Grid").prop("p", prop).describe("x").build()).toThrow(
        'U: Grid declares no type parameter "U"; add .generic(param("U")) before using it.',
      );
    }
    expect(() => component("Grid").childProp("p", bindable(U)).describe("x").build()).toThrow(
      'U: Grid declares no type parameter "U"',
    );
  });

  it("accepts props without types and scalar types", () => {
    expect(() => component("Ok").prop("a", event()).prop("b", bindable(text)).describe("x").build()).not.toThrow();
  });

  it("refuses a type parameter declared twice", () => {
    expect(() => component("Grid").generic(T).generic(param("T"))).toThrow(
      'Grid declares type parameter "T" twice; declare it once.',
    );
  });

  it("refuses two props with one name", () => {
    expect(() => component("Grid").prop("a", event()).prop("a", event())).toThrow(
      'Grid has two props named "a"; give the prop its own name.',
    );
    expect(() => component("Grid").prop("a", event()).childProp("a", event())).toThrow(
      'Grid has two props named "a"; give the child prop its own name.',
    );
    expect(() => component("Grid").childProp("a", event()).prop("a", event())).toThrow(
      'Grid has two props named "a"; give the prop its own name.',
    );
  });

  it("refuses a component without a description", () => {
    expect(() => component("Grid").build()).toThrow('Grid has no description; add .describe("what it is for").');
  });

  it("copies what it built", () => {
    const builder = component("Grid").generic(T).prop("a", event()).childProp("w", event()).rule("r").describe("x");
    const first = builder.build();
    builder.prop("b", event()).childProp("v", event()).rule("s").generic(param("U"));
    expect(first.props).toEqual({ a: { kind: "event", optional: false } });
    expect(first.childProps).toEqual({ w: { kind: "event", optional: false } });
    expect(first.rules).toEqual(["r"]);
    expect(first.generics).toEqual(["T"]);
  });
});

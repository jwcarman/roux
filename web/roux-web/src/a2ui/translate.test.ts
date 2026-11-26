import {
  CommonSchemas,
  type Action,
  type DynamicBoolean,
  type DynamicNumber,
  type DynamicString,
  type DynamicValue,
} from "@a2ui/web_core/v1_0";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod3";
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
} from "./builder";
import { toA2ui } from "./translate";

const OPTS = { catalogId: "https://example.test/catalog.json", version: "9.9.9" };

/** Translates one component with one prop and returns that prop's schema. */
function lowered(prop: Parameters<ReturnType<typeof component>["prop"]>[1]): z.ZodTypeAny {
  const { apis } = toA2ui([component("C").prop("p", prop).describe("c").build()], OPTS);
  return shapeOf(apis.C.schema).p;
}

/** A translated component's schema, by prop. */
function shapeOf(schema: unknown): Record<string, z.ZodTypeAny> {
  return (schema as { shape: Record<string, z.ZodTypeAny> }).shape;
}

const accepts = (schema: z.ZodTypeAny, value: unknown) => schema.safeParse(value).success;

describe("bound props", () => {
  it("are A2UI's dynamic strings for every text-like type", () => {
    const T = param("T");
    for (const type of [text, email, url, phone, date, time, id, oneOf(["a"])]) {
      expect(lowered(bindable(type))).toBe(CommonSchemas.DynamicString);
    }
    const { apis } = toA2ui(
      [
        component("C")
          .generic(T)
          .prop("p", bindable(fieldOf(T)))
          .describe("c")
          .build(),
      ],
      OPTS,
    );
    expect(shapeOf(apis.C.schema).p).toBe(CommonSchemas.DynamicString);
  });

  it("are dynamic numbers, booleans or values by type", () => {
    expect(lowered(bindable(number))).toBe(CommonSchemas.DynamicNumber);
    expect(lowered(bindable(integer))).toBe(CommonSchemas.DynamicNumber);
    expect(lowered(bindable(boolean))).toBe(CommonSchemas.DynamicBoolean);
    for (const type of [money, record({ a: text }), list(text), options(text), array(text), map(text)]) {
      expect(lowered(bindable(type))).toBe(CommonSchemas.DynamicValue);
    }
  });

  it("look through an optional type", () => {
    expect(lowered(bindable(optional(text)))).toBe(CommonSchemas.DynamicString);
    expect(lowered(bindable(optional(number)))).toBe(CommonSchemas.DynamicNumber);
  });

  it("are optional when the prop is", () => {
    const schema = lowered(optional(bindable(text)));
    expect(accepts(schema, undefined)).toBe(true);
    expect(accepts(schema, { "@path": "/a" })).toBe(true);
    expect(accepts(schema, 1)).toBe(false);
    expect(accepts(lowered(bindable(text)), undefined)).toBe(false);
  });
});

describe("literal props", () => {
  it("take plain values of their type", () => {
    for (const type of [text, email, url, phone, date, time, id, fieldOf(param("T"))]) {
      const T = param("T");
      const { apis } = toA2ui([component("C").generic(T).prop("p", literal(type)).describe("c").build()], OPTS);
      const schema = shapeOf(apis.C.schema).p;
      expect(accepts(schema, "a")).toBe(true);
      expect(accepts(schema, 1)).toBe(false);
      expect(accepts(schema, { "@path": "/a" })).toBe(false);
    }
    for (const type of [number, integer]) {
      expect(accepts(lowered(literal(type)), 2)).toBe(true);
      expect(accepts(lowered(literal(type)), "2")).toBe(false);
    }
    expect(accepts(lowered(literal(boolean)), true)).toBe(true);
    expect(accepts(lowered(literal(boolean)), "true")).toBe(false);
  });

  it("take money as minor units and a currency", () => {
    const schema = lowered(literal(money));
    expect(accepts(schema, { minorUnits: 100, currency: "USD" })).toBe(true);
    expect(accepts(schema, { minorUnits: "100", currency: "USD" })).toBe(false);
    expect(accepts(schema, { minorUnits: 100, currency: 1 })).toBe(false);
  });

  it("take one of a set of words", () => {
    const schema = lowered(literal(oneOf(["sm", "md"])));
    expect(accepts(schema, "md")).toBe(true);
    expect(accepts(schema, "lg")).toBe(false);
  });

  it("take records, with optional fields", () => {
    const schema = lowered(literal(record({ header: text, format: optional(oneOf(["date"])) })));
    expect(accepts(schema, { header: "Name" })).toBe(true);
    expect(accepts(schema, { header: "Name", format: "date" })).toBe(true);
    expect(accepts(schema, { header: "Name", format: "money" })).toBe(false);
    expect(accepts(schema, { format: "date" })).toBe(false);
  });

  it("take maps and arrays", () => {
    const tones = lowered(literal(map(oneOf(["warning"]))));
    expect(accepts(tones, { Late: "warning" })).toBe(true);
    expect(accepts(tones, { Late: "loud" })).toBe(false);
    const columns = lowered(literal(array(text)));
    expect(accepts(columns, ["a", "b"])).toBe(true);
    expect(accepts(columns, [1])).toBe(false);
  });

  it("take pages and options in their wire shape", () => {
    const page = lowered(literal(list(text)));
    expect(accepts(page, { data: ["a"], pagination: {} })).toBe(true);
    expect(accepts(page, { data: [1], pagination: {} })).toBe(false);
    expect(accepts(page, ["a"])).toBe(false);
    const choices = lowered(literal(options(text)));
    expect(accepts(choices, [{ value: "a", label: "A" }])).toBe(true);
    expect(accepts(choices, [{ value: "a" }])).toBe(false);
    expect(accepts(choices, [{ label: "A" }])).toBe(false);
  });

  it("take anything for a bare type parameter", () => {
    const T = param("T");
    const { apis } = toA2ui([component("C").generic(T).prop("p", literal(T)).describe("c").build()], OPTS);
    const schema = shapeOf(apis.C.schema).p;
    expect(accepts(schema, { any: "thing" })).toBe(true);
  });
});

describe("structural props", () => {
  it("are A2UI's actions, child lists, children and checks", () => {
    expect(lowered(event())).toBe(CommonSchemas.Action);
    expect(lowered(children())).toBe(CommonSchemas.ChildList);
    expect(lowered(child())).toBe(CommonSchemas.Child);
    const rules = lowered(checks());
    expect(accepts(rules, undefined)).toBe(true);
    expect(accepts(rules, [{ condition: { "@call": "required", args: { value: "x" } }, message: "Required" }])).toBe(
      true,
    );
    expect(accepts(rules, "required")).toBe(false);
  });
});

describe("toA2ui", () => {
  const row = component("Row")
    .prop("children", children())
    .childProp("weight", literal(number))
    .describe("Side by side.")
    .build();
  const heading = component("Heading")
    .prop("text", bindable(text))
    .prop("size", optional(literal(oneOf(["sm", "xl"]))))
    .prop("onTap", optional(event()))
    .describe("A heading.")
    .build();
  const translated = toA2ui([row, heading], OPTS);

  it("lists component APIs by name and in order", () => {
    expect(translated.componentApis.map((api) => api.name)).toEqual(["Row", "Heading"]);
    expect(translated.apis.Heading).toBe(translated.componentApis[1]);
    expect(translated.apis.Heading.description).toBe("A heading.");
  });

  it("lets every component carry every child prop, optionally", () => {
    const schema = translated.apis.Heading.schema as unknown as z.ZodTypeAny;
    expect(accepts(schema, { text: "Hi", weight: 2 })).toBe(true);
    expect(accepts(schema, { text: "Hi" })).toBe(true);
    expect(accepts(schema, { text: "Hi", weight: "2" })).toBe(false);
    expect(accepts(translated.apis.Row.schema as unknown as z.ZodTypeAny, { children: ["a"], weight: 1 })).toBe(true);
  });

  it("types the props each renderer receives", () => {
    expectTypeOf<z.infer<typeof translated.apis.Heading.schema>>().toEqualTypeOf<{
      text: DynamicString;
      size?: "sm" | "xl";
      onTap?: Action;
      weight?: number;
    }>();
    const typed = toA2ui(
      [
        component("Mixed")
          .prop("n", bindable(number))
          .prop("b", bindable(boolean))
          .prop("v", bindable(money))
          .describe("m")
          .build(),
      ],
      OPTS,
    );
    expectTypeOf<z.infer<typeof typed.apis.Mixed.schema>>().toEqualTypeOf<{
      n: DynamicNumber;
      b: DynamicBoolean;
      v: DynamicValue;
    }>();
    expect(typed.componentApis).toHaveLength(1);
  });

  it("builds a web_core catalog under the catalog id", () => {
    const catalog = translated.catalog();
    expect(catalog.id).toBe(OPTS.catalogId);
    expect(Object.keys((catalog.toJson() as { components: object }).components)).toEqual(["Row", "Heading"]);
  });

  it("documents the catalog, with the typed definitions under extensions.roux", () => {
    const json = translated.catalog().toJson();
    const { metadata, ...rest } = translated.document as Record<string, unknown> & {
      metadata: { extensions: { roux: unknown } };
    };
    expect(rest).toEqual(Object.fromEntries(Object.entries(json).filter(([key]) => key !== "metadata")));
    expect(metadata.extensions.roux).toEqual({ version: "9.9.9", components: [row, heading] });
  });

  it("gives the prompt each component's description and schema", () => {
    const json = translated.catalog().toJson() as { components: Record<string, unknown> };
    expect(translated.promptEntries).toEqual([
      { name: "Row", description: "Side by side.", schema: json.components.Row },
      { name: "Heading", description: "A heading.", schema: json.components.Heading },
    ]);
  });

  it("refuses two components with one name", () => {
    expect(() => toA2ui([heading, heading], OPTS)).toThrow(
      'Two components are named "Heading"; give each its own name.',
    );
  });
});

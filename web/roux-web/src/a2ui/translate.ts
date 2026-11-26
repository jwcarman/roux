// Translates the typed catalog into what the A2UI SDK consumes: web_core component APIs (Zod 3 schemas, the only
// place Zod 3 appears), the A2UI catalog document, and the entries the drawing prompt prints. A2UI can't say
// everything the typed catalog does, so types are lowered: a bound text is a DynamicString, a field of a type
// parameter is a string, a child prop is an optional prop on every component. The full typing rides along in the
// document's extensions.roux.
import { Catalog, type ComponentApi } from "@a2ui/web_core";
import { CommonSchemas, V10_VALIDATION_FUNCTION_IMPLEMENTATIONS } from "@a2ui/web_core/v1_0";
import { z } from "zod3";
import type { ChildPropsOf, ComponentDef, PropsOf } from "./builder";
import type { PropShape, Type } from "./types";

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type AllChildProps<Defs extends readonly ComponentDef[]> = UnionToIntersection<ChildPropsOf<Defs[number]>>;
type Optional<T> = { [K in keyof T]?: T[K] };

/** The web_core API of one component: its schema infers the props its renderer receives. */
export type ApiOf<D, Child> = ComponentApi<z.ZodType<Simplify<PropsOf<D> & Optional<Child>>>> & {
  description: string;
};

/** A web_core component API with the description the drawing agent reads. */
export type DescribedApi = ComponentApi & { description: string };

export type Apis<Defs extends readonly ComponentDef[]> = {
  [D in Defs[number] as D["name"]]: ApiOf<D, AllChildProps<Defs>>;
};

export interface PromptEntry {
  name: string;
  description: string;
  /** The component's JSON Schema, as the catalog document has it. */
  schema: unknown;
}

export interface A2uiCatalog<Defs extends readonly ComponentDef[]> {
  /** Each component's web_core API, by name. */
  apis: Apis<Defs>;
  /** The same APIs, in definition order. */
  componentApis: DescribedApi[];
  /** A web_core catalog of the components and A2UI v1.0's check functions. */
  catalog: () => Catalog<ComponentApi>;
  /** The A2UI catalog document, with the typed definitions under metadata.extensions.roux. */
  document: Record<string, unknown>;
  promptEntries: PromptEntry[];
}

const TEXT_LIKE = new Set(["text", "email", "url", "phone", "date", "time", "id"]);

function boundSchema(type: Type): z.ZodTypeAny {
  switch (type.kind) {
    case "optional":
      return boundSchema(type.of);
    case "oneOf":
    case "fieldOf":
      return CommonSchemas.DynamicString;
    case "scalar":
      if (TEXT_LIKE.has(type.scalar)) return CommonSchemas.DynamicString;
      if (type.scalar === "number" || type.scalar === "integer") return CommonSchemas.DynamicNumber;
      if (type.scalar === "boolean") return CommonSchemas.DynamicBoolean;
      return CommonSchemas.DynamicValue;
    default:
      return CommonSchemas.DynamicValue;
  }
}

function literalSchema(type: Type): z.ZodTypeAny {
  switch (type.kind) {
    case "scalar":
      if (TEXT_LIKE.has(type.scalar)) return z.string();
      if (type.scalar === "number" || type.scalar === "integer") return z.number();
      if (type.scalar === "boolean") return z.boolean();
      return z.object({ minorUnits: z.number(), currency: z.string() });
    case "oneOf":
      return z.enum(type.values as [string, ...string[]]);
    case "fieldOf":
      return z.string();
    case "record":
      return z.object(
        Object.fromEntries(Object.entries(type.fields).map(([name, field]) => [name, literalSchema(field)])),
      );
    case "optional":
      return literalSchema(type.of).optional();
    case "map":
      return z.record(z.string(), literalSchema(type.of));
    case "array":
      return z.array(literalSchema(type.of));
    case "list":
      return z.object({ data: z.array(literalSchema(type.of)), pagination: z.unknown() });
    case "options":
      return z.array(z.object({ value: z.string(), label: z.string() }));
    case "param":
      return z.unknown();
  }
}

function propSchema(prop: PropShape): z.ZodTypeAny {
  const schema = baseSchema(prop);
  return prop.optional ? schema.optional() : schema;
}

function baseSchema(prop: PropShape): z.ZodTypeAny {
  switch (prop.kind) {
    case "bindable":
      return boundSchema(prop.type);
    case "literal":
      return literalSchema(prop.type);
    case "event":
      return CommonSchemas.Action;
    case "children":
      return CommonSchemas.ChildList;
    case "child":
      return CommonSchemas.Child;
    case "checks":
      return CommonSchemas.Checkable.shape["@checks"];
  }
}

/** Translates component definitions into web_core APIs, a catalog and its A2UI document. */
export function toA2ui<const Defs extends readonly ComponentDef[]>(
  defs: Defs,
  options: { catalogId: string; version: string },
): A2uiCatalog<Defs> {
  const names = new Set<string>();
  for (const def of defs) {
    if (names.has(def.name)) throw new Error(`Two components are named "${def.name}"; give each its own name.`);
    names.add(def.name);
  }
  const childProps: Record<string, z.ZodTypeAny> = {};
  for (const def of defs) {
    for (const [name, prop] of Object.entries(def.childProps)) childProps[name] = baseSchema(prop).optional();
  }
  const componentApis: DescribedApi[] = defs.map((def) => ({
    name: def.name,
    description: def.description,
    schema: z.object({
      ...Object.fromEntries(Object.entries(def.props).map(([name, prop]) => [name, propSchema(prop)])),
      ...childProps,
    }),
  }));
  const catalog = () =>
    new Catalog<ComponentApi>(options.catalogId, "1.0", componentApis, V10_VALIDATION_FUNCTION_IMPLEMENTATIONS);
  const json = catalog().toJson() as Record<string, unknown> & { components: Record<string, unknown> };
  const document = {
    ...json,
    metadata: { extensions: { roux: { version: options.version, components: [...defs] } } },
  };
  const promptEntries = defs.map((def) => ({
    name: def.name,
    description: def.description,
    schema: json.components[def.name],
  }));
  return {
    apis: Object.fromEntries(componentApis.map((api) => [api.name, api])) as Apis<Defs>,
    componentApis,
    catalog,
    document,
    promptEntries,
  };
}

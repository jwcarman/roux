// A surface's TypeScript types, derived from its A2UI JSON and the typed catalog. Each bound prop says what its path
// must hold (the catalog types the prop); a generic component's type parameter is filled from the fields its literal
// props name (a column's `field`) and their formats. The result is what an app's binding must supply: its data by
// top-level path, and each event's context. The output is deterministic: fields follow their first use walking the
// surface from its root, so the same surface always produces the same text.
import type { ComponentDef } from "./builder";

/** One component of a surface: its id, the catalog component it is, and that component's props. */
export type SurfaceComponent = { id: string; component: string; [prop: string]: unknown };

/** A surface's committed file (`<id>.surface.json`): its whole shape. */
export type SurfaceJson = { id: string; components: SurfaceComponent[] };

type PropShape = ComponentDef["props"][string];
type Type = Extract<PropShape, { type: unknown }>["type"];

type Leaf = { kind: "leaf"; ts: string; nullable: boolean };
type ObjectNode = { kind: "object"; fields: Map<string, TypeNode> };
type TypeNode = ObjectNode | { kind: "array"; of: TypeNode } | { kind: "map"; of: TypeNode } | Leaf;

const leaf = (ts: string, nullable = false): Leaf => ({ kind: "leaf", ts, nullable });
const objectOf = (fields: Map<string, TypeNode>): ObjectNode => ({ kind: "object", fields });
const object = (fields: Record<string, TypeNode>): ObjectNode => objectOf(new Map(Object.entries(fields)));

/** A cell is null when empty, so text, badge, time and any other format give `string | null`; a list is never null. */
const TEXT_CELL = leaf("string", true);
const FORMAT: Record<string, Leaf> = {
  date: leaf("IsoDate", true),
  money: leaf("Money", true),
  list: leaf("string[]"),
};

const SCALAR: Record<string, string> = {
  text: "string",
  email: "string",
  url: "string",
  phone: "string",
  id: "string",
  time: "string",
  date: "IsoDate",
  number: "number",
  integer: "number",
  boolean: "boolean",
  money: "Money",
};

type Binding = { "@path": string };
type Event = { name: string; context?: Record<string, unknown> };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isBinding = (value: unknown): value is Binding => isObject(value) && typeof value["@path"] === "string";
const keysOf = (path: string): string[] => path.split("/").filter(Boolean);

/** The keys of an absolute path; a relative one would read as a top-level path, so it is refused. */
function absoluteKeys(path: string, reader: string): string[] {
  if (!path.startsWith("/")) {
    throw new Error(`${reader} reads "${path}", a relative path; surfaces bind absolute paths like "/draft/name".`);
  }
  return keysOf(path);
}

function eventOf(value: unknown): Event | undefined {
  if (!isObject(value) || !isObject(value.event) || typeof value.event.name !== "string") return undefined;
  return value.event as Event;
}

/** The leaf two uses share, if they share a type; a value either use requires present is present. */
function sharedLeaf(a: Leaf, b: Leaf): Leaf | undefined {
  return a.ts === b.ts ? leaf(a.ts, a.nullable && b.nullable) : undefined;
}

/**
 * The fields a type parameter's records must have: each `fieldOf(T)` a literal prop names. A field shown in a record
 * is a cell, typed by the record's `format` (an empty cell is null); one named without a record around it (a link's
 * param) must be present.
 */
function fieldsOf(param: string, def: ComponentDef, component: SurfaceComponent): Map<string, TypeNode> {
  const fields = new Map<string, Leaf>();
  const add = (name: string, next: Leaf): void => {
    const earlier = fields.get(name);
    const merged = earlier === undefined ? next : sharedLeaf(earlier, next);
    if (merged === undefined) {
      throw new Error(
        `${component.id} uses the field "${name}" as ${renderLeaf(earlier as Leaf)} in one place and ${renderLeaf(next)} in another.`,
      );
    }
    fields.set(name, merged);
  };
  const walk = (type: Type, value: unknown, cell: Leaf | undefined): void => {
    switch (type.kind) {
      case "fieldOf":
        if (type.param === param && typeof value === "string") {
          add(value, cell ?? leaf("string"));
        }
        return;
      case "array":
      case "map":
        if (isObject(value)) for (const item of Object.values(value)) walk(type.of, item, undefined);
        return;
      case "optional":
        walk(type.of, value, cell);
        return;
      case "record":
        if (isObject(value)) {
          // String() so an absent format reads as no format at all: a text cell.
          const own = FORMAT[String(value.format)] ?? TEXT_CELL;
          for (const [name, field] of Object.entries(type.fields)) walk(field, value[name], own);
        }
    }
  };
  for (const [name, prop] of Object.entries(def.props)) {
    if (prop.kind === "literal") walk(prop.type, component[name], undefined);
  }
  return new Map(fields);
}

/** What a path bound to a prop of this type must hold. */
function nodeOf(type: Type, def: ComponentDef, component: SurfaceComponent): TypeNode {
  switch (type.kind) {
    case "scalar":
      return leaf(SCALAR[type.scalar]);
    case "oneOf":
    case "fieldOf":
      return leaf("string");
    case "optional":
      return nodeOf(type.of, def, component);
    case "record":
      return object(Object.fromEntries(Object.entries(type.fields).map(([k, f]) => [k, nodeOf(f, def, component)])));
    case "map":
      return { kind: "map", of: nodeOf(type.of, def, component) };
    case "array":
      return { kind: "array", of: nodeOf(type.of, def, component) };
    case "list":
      return object({
        data: { kind: "array", of: nodeOf(type.of, def, component) },
        pagination: leaf("Pagination"),
      });
    case "options":
      return { kind: "array", of: object({ value: leaf("string"), label: leaf("string") }) };
    case "param": {
      const fields = fieldsOf(type.name, def, component);
      if (fields.size > 0) return objectOf(fields);
      // A parameter no field names takes its component's format (Stat: money, otherwise a number).
      return leaf(component.format === "money" ? "Money" : "number");
    }
  }
}

/** Both uses must hold, so a field required in one place is required everywhere. */
function merge(at: string, a: TypeNode, b: TypeNode): TypeNode {
  if (a.kind === "object" && b.kind === "object") return mergeObjects(at, a, b);
  if (a.kind === "array" && b.kind === "array") return { kind: "array", of: merge(`${at}/*`, a.of, b.of) };
  if (a.kind === "map" && b.kind === "map") return { kind: "map", of: merge(`${at}/*`, a.of, b.of) };
  // Objects, arrays and maps of one kind merged above, so two nodes of one kind left here are leaves.
  const shared = a.kind === b.kind ? sharedLeaf(a as Leaf, b as Leaf) : undefined;
  if (shared !== undefined) return shared;
  throw new Error(`${at} is used as ${render(a, "")} in one place and ${render(b, "")} in another.`);
}

function mergeObjects(at: string, a: ObjectNode, b: ObjectNode): ObjectNode {
  const fields = new Map(a.fields);
  for (const [key, value] of b.fields) {
    const earlier = fields.get(key);
    fields.set(key, earlier === undefined ? value : merge(`${at}/${key}`, earlier, value));
  }
  return objectOf(fields);
}

const renderLeaf = (node: Leaf): string => (node.nullable ? `${node.ts} | null` : node.ts);

function render(node: TypeNode, indent: string): string {
  if (node.kind === "leaf") return renderLeaf(node);
  if (node.kind === "array") return `${render(node.of, indent)}[]`;
  if (node.kind === "map") return `Record<string, ${render(node.of, indent)}>`;
  if (node.fields.size === 0) return "Record<string, never>";
  const inner = `${indent}  `;
  const lines = [...node.fields].map(
    ([key, value]) => `${inner}${/^[A-Za-z_]\w*$/.test(key) ? key : JSON.stringify(key)}: ${render(value, inner)};`,
  );
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function lookup(root: TypeNode, keys: string[]): TypeNode | undefined {
  let node: TypeNode | undefined = root;
  for (const key of keys) node = node?.kind === "object" ? node.fields.get(key) : undefined;
  return node;
}

function literalType(value: unknown): Leaf {
  return leaf(
    typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? typeof value : "unknown",
  );
}

/** The ids a component lists as children: a list of ids, or one child. A template is refused: it can't be typed yet. */
function childIds(def: ComponentDef, component: SurfaceComponent): string[] {
  const ids: string[] = [];
  for (const [name, prop] of Object.entries(def.props)) {
    const value = component[name];
    if (prop.kind === "child" && typeof value === "string") ids.push(value);
    if (prop.kind !== "children") continue;
    if (Array.isArray(value)) ids.push(...value.filter((id): id is string => typeof id === "string"));
    else if (isObject(value)) {
      throw new Error(
        `${component.id}'s ${name} repeat ${String(value.path)} as a template, which surfaces don't support yet; list the children by id.`,
      );
    }
  }
  return ids;
}

/** The surface's components in first-use order: the tree from `root`, then any component nothing reaches. */
function inTreeOrder(components: SurfaceComponent[], byName: Map<string, ComponentDef>): SurfaceComponent[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const ordered: SurfaceComponent[] = [];
  const seen = new Set<string>();
  const visit = (component: SurfaceComponent): void => {
    if (seen.has(component.id)) return;
    seen.add(component.id);
    const def = byName.get(component.component);
    if (def === undefined) {
      throw new Error(`${component.id} is a "${component.component}", which the catalog doesn't define.`);
    }
    ordered.push(component);
    for (const id of childIds(def, component)) {
      const child = byId.get(id);
      if (child === undefined) {
        throw new Error(`${component.id} lists the child "${id}", which the surface doesn't define.`);
      }
      visit(child);
    }
  };
  const root = byId.get("root");
  if (root !== undefined) visit(root);
  for (const component of components) visit(component);
  return ordered;
}

function declaration(name: string, fields: Map<string, TypeNode>): string {
  if (fields.size === 0) return `export type ${name} = Record<string, never>;`;
  return `export interface ${name} ${render(objectOf(fields), "")}`;
}

/** The TypeScript an app's binding of the surface must satisfy: its data, by top-level path, and its events' contexts. */
export function surfaceTypes(surface: SurfaceJson, defs: readonly ComponentDef[]): string {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(surface.id)) {
    throw new Error(`Surface id "${surface.id}" must be letters and digits, starting with a letter.`);
  }
  const byName = new Map(defs.map((def) => [def.name, def]));
  let data = object({});
  const sent: Event[] = [];

  for (const component of inTreeOrder(surface.components, byName)) {
    const def = byName.get(component.component) as ComponentDef;
    for (const [name, prop] of Object.entries(def.props)) {
      const value = component[name];
      if (prop.kind === "bindable" && isBinding(value)) {
        const keys = absoluteKeys(value["@path"], `${component.id}.${name}`);
        const last = keys.pop();
        if (last === undefined) {
          throw new Error(
            `${component.id} binds ${name} to "${value["@path"]}", which names nothing; use a path like "/name".`,
          );
        }
        let node = object({ [last]: nodeOf(prop.type, def, component) });
        for (const key of keys.reverse()) node = object({ [key]: node });
        data = mergeObjects("", data, node);
      }
      const event = prop.kind === "event" ? eventOf(value) : undefined;
      if (event !== undefined) sent.push(event);
    }
  }

  const events = new Map<string, TypeNode>();
  for (const { name, context = {} } of sent) {
    const fields = Object.entries(context).map(([key, value]): [string, TypeNode] => {
      if (!isBinding(value)) return [key, literalType(value)];
      const found = lookup(data, absoluteKeys(value["@path"], `${name}'s context`));
      if (found === undefined) {
        throw new Error(
          `${name}'s context reads ${value["@path"]}, which nothing on the surface shows or edits; bind it to a path a component uses.`,
        );
      }
      return [key, found];
    });
    const node = objectOf(new Map(fields));
    const earlier = events.get(name);
    if (earlier !== undefined && render(earlier, "") !== render(node, "")) {
      throw new Error(`${name} is sent with different contexts in different places; give each its own event name.`);
    }
    events.set(name, node);
  }

  const name = surface.id.charAt(0).toUpperCase() + surface.id.slice(1);
  const body = [
    `/** What the ${surface.id} surface shows, by top-level path: each is bound to a query or kept locally. */`,
    declaration(`${name}SurfaceData`, data.fields),
    ``,
    `/** What each of the ${surface.id} surface's events carries. */`,
    declaration(`${name}SurfaceEvents`, events),
    ``,
  ].join("\n");
  // Only the names the text uses are imported: an unused type import fails an app's lint.
  const used = ["IsoDate", "Money", "Pagination"].filter((word) => new RegExp(`\\b${word}\\b`).test(body));
  const imports = used.length === 0 ? [] : [`import type { ${used.join(", ")} } from "@jwcarman/roux-web/surface";`];
  return [
    `// Generated from ${surface.id}.surface.json and the typed catalog. Do not edit.`,
    ...imports,
    ``,
    body,
  ].join("\n");
}

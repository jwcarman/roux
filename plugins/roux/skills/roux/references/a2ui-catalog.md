# The A2UI catalog

roux's A2UI components are defined once, typed, in `@jwcarman/roux-web/a2ui`; the A2UI SDK's schemas, the catalog
document and the drawing prompt's entries are generated from them. Needs `@a2ui/web_core` and
`"zod3": "npm:zod@3.25.76"` installed beside roux-web.

## Rules

- Never write an A2UI component schema by hand: define the component with `component(...)` and translate with
  `toA2ui`. roux's own components are `PRIMITIVES`, already translated as `rouxCatalog`.
- Zod 3 only reaches the generated schemas (`zod3`); a definition is plain TypeScript.
- Every component has `.describe(...)`: the drawing agent reads it.
- Every list a component binds is a page: `list(T)` is `{data, pagination}`.
- A field reference into a generic component's records is `fieldOf(T)`, with `T` declared by `.generic(T)`.

## Names

- `rouxCatalog` (an `A2uiCatalog`): `.apis.Heading` (a `DescribedApi`: `name`, `description`, Zod 3 `schema`;
  pass it to `createComponentImplementation`), `.componentApis` (in order), `.catalog()` (a new web_core `Catalog`
  with v1.0's checks), `.document` (the A2UI catalog JSON; typing under `metadata.extensions.roux`),
  `.promptEntries` (a `PromptEntry` each: `name`, `description`, `schema`).
- `CATALOG_ID` (`https://jwcarman.github.io/roux/a2ui/catalog-v1.json`), `CATALOG_VERSION`, `PRIMITIVES`: Column,
  Row, Heading, Text, Card, Stat, Button, DataTable, CardList, Form, InputField, SelectField. Row and Column take
  `gap`, `justify` (start, center, end, spaceBetween, spaceAround, spaceEvenly, stretch), `align` (start, center,
  end, stretch); their children take `weight`.
- `component(name)` → `.generic(T)`, `.prop(name, prop)`, `.childProp(name, prop)`, `.rule(text)`,
  `.describe(text)`, `.build()` → `ComponentDef`. `PropsOf<typeof def>` is the renderer's props type.
- Types: `text`, `email`, `url`, `phone`, `date`, `time`, `number`, `integer`, `money`, `id`, `boolean`,
  `oneOf([...])`, `record({...}, name?)`, `map(type)`, `list(type)`, `options(type)`, `array(type)`, `param("T")`,
  `fieldOf(T)`, `optional(type)`.
- Props: `bindable(type)` (literal or `{"@path"}`), `literal(type)`, `event()`, `children()` (ids or a template
  `{path, componentId}`), `child()`, `checks()`; `optional(prop)`.
- `toA2ui(defs, { catalogId, version })` → `A2uiCatalog`.

## Example

```ts
import { bindable, component, literal, oneOf, optional, text, toA2ui } from "@jwcarman/roux-web/a2ui";

const Badge = component("Badge")
  .prop("label", bindable(text))
  .prop("tone", optional(literal(oneOf(["neutral", "warning"]))))
  .describe("A short status word.")
  .build();

const { catalog, apis } = toA2ui([Badge], { catalogId: "https://example.test/catalog.json", version: "0.1.0" });
```

## Lowering

A bindable text-like type, `oneOf` or `fieldOf` → `DynamicString`; `number`/`integer` → `DynamicNumber`;
`boolean` → `DynamicBoolean`; anything else bound → `DynamicValue`. A literal `fieldOf(T)` → a string. A child prop
→ an optional prop on every component.

## Pitfalls

- `fieldOf(U)` without `.generic(U)` throws at `.build()`, naming the fix; so do duplicate props and a missing
  `.describe`.
- `toA2ui` refuses two components with one name.
- A2UI's schemas don't reject unknown props: a misspelled prop name passes validation.

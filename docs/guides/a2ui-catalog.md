# The A2UI catalog

Screens can be data: [A2UI](https://a2ui.org) JSON that names components and binds their props to a data model.
roux's catalog says which components exist and what each prop takes. It is written once, in a typed format, in
`@jwcarman/roux-web/a2ui`, and everything the A2UI SDK (`@a2ui/web_core`) needs is generated from it.

The format is typed more precisely than A2UI can say: a table's rows are a page of records of some type `T`, and each
column names a field of `T`. A2UI only knows "any value" and "a string". The precise typing is what later tells a
screen's data apart (which queries it reads, which commands its buttons send); the translation lowers it to what A2UI
understands.

To use it, install the SDK beside roux-web: `@a2ui/web_core` and Zod 3 under the alias `zod3`
(`"zod3": "npm:zod@3.25.76"`). Zod 3 appears only in the generated schemas, because web_core is built on it; the
format itself is plain TypeScript.

## roux's catalog

`rouxCatalog` is roux's primitives, translated:

```ts
import { rouxCatalog } from "@jwcarman/roux-web/a2ui";

const catalog = rouxCatalog.catalog();           // a web_core Catalog: for MessageProcessor and renderers
const heading = rouxCatalog.apis.Heading;        // one component's web_core API, typed
const prompt = rouxCatalog.promptEntries;        // each component's description and JSON Schema
```

- `rouxCatalog.apis` — each component's web_core API by name (a `DescribedApi`: `name`, `description`, Zod 3
  `schema`). A renderer passes it to `createComponentImplementation`; the schema's type is the props it receives.
- `rouxCatalog.componentApis` — the same APIs, in order.
- `rouxCatalog.catalog()` — a new web_core `Catalog` of the components and A2UI v1.0's check functions, under
  `CATALOG_ID` (`https://jwcarman.github.io/roux/a2ui/catalog-v1.json`). `CATALOG_VERSION` is the catalog's
  version.
- `rouxCatalog.document` — the A2UI catalog document (JSON), with the typed definitions under
  `metadata.extensions.roux`.
- `rouxCatalog.promptEntries` — a `PromptEntry` per component (`name`, `description`, `schema`): what a drawing
  agent reads about each one.

`PRIMITIVES` is the list of definitions behind it: Column, Row, Heading, Text, Card, Stat, Button, DataTable,
CardList, Form, InputField and SelectField. Row and Column lay out like flexbox: `gap`, `justify` (start, center,
end, spaceBetween, spaceAround, spaceEvenly, stretch), `align` (start, center, end, stretch), and a child's
`weight` (its share of the spare space).

## Defining a component

A definition is built with `component(name)`, then made with `.build()` into a `ComponentDef` (plain data):

```ts
import { array, bindable, component, fieldOf, list, literal, optional, param, record, text } from "@jwcarman/roux-web/a2ui";

const T = param("T");
const DataTable = component("DataTable")
  .generic(T)
  .prop("columns", literal(array(record({ header: text, field: fieldOf(T) }))))
  .prop("rows", bindable(list(T)))
  .prop("emptyText", optional(literal(text)))
  .rule("a column's format fits its field's type")
  .describe("A paged, sortable table of records. ...")
  .build();
```

**Types.** Scalars are named after roux-web's form rules: `text`, `email`, `url`, `phone`, `date` (yyyy-mm-dd),
`time`, `number`, `integer`, `money` (`{minorUnits, currency}`), `id`, `boolean`. Then `oneOf([...])` (one of some
words), `record({...}, name?)` (named fields; a name makes it one of the app's shared records), `map(type)` (any word
to a value), `list(type)` (a page: `{data, pagination}`; every list the server sends is paged), `options(type)` (a
capped set of `{value, label}`), `array(type)` (written in the component), `param("T")` (a type parameter, declared
with `.generic(T)`) and `fieldOf(T)` (the name of a field of `T`'s records). `optional(type)` makes a record field
optional.

**Props.** Each prop is one of:

- `bindable(type)` — written literally or bound to the data model with `{"@path": "/..."}`;
- `literal(type)` — written in the component; it cannot be bound;
- `event()` — an action the app handles;
- `children()` — component ids, or a template `{path, componentId}` repeated for each item of a list;
- `child()` — one component id;
- `checks()` — the field's `@checks`.

`optional(prop)` lets a prop be left out. `.childProp(name, prop)` declares a prop the component's *children* may
carry (Row's `weight`). `.rule(text)` records a rule spanning props, for checks that come later. `.describe(text)` is
what the drawing agent reads; a component without one is refused.

Misuse fails at `.build()` or before, saying what to do: two props with one name, a type parameter declared twice,
`fieldOf(U)` or `U` used without `.generic(U)`.

`PropsOf<typeof def>` is the props type a renderer receives for a definition.

## Translating

`toA2ui(defs, { catalogId, version })` translates any list of definitions into an `A2uiCatalog` — the shape of
`rouxCatalog` above. Two components with one name are refused. What A2UI can't say is lowered:

| Typed | A2UI |
|---|---|
| a bindable text-like type, `oneOf`, `fieldOf` | `DynamicString` |
| a bindable `number` or `integer` | `DynamicNumber` |
| a bindable `boolean` | `DynamicBoolean` |
| any other bindable type | `DynamicValue` |
| `fieldOf(T)` written literally | a string |
| a child prop | an optional prop on every component |
| `children()`, `child()`, `event()`, `checks()` | `ChildList`, `Child`, `Action`, `@checks` |

The full typing is kept in the document's `metadata.extensions.roux`.

# Typed A2UI catalog — design (part 1: the format and the translator)

**Why.** tasting draws owner-approved screens as A2UI JSON, and the runtime spike (~/IdeaProjects/runtime-spike) showed
the same JSON can run as a live roux screen, wired to typed queries and commands. What's missing is a *contract*.
A2UI types a component's props only loosely (`DynamicValue` means "anything") and says nothing about the data model,
so nothing connects "this table shows customers" to "the server must provide a paged list of
`{name, email, since, status}`". We want the drawing to *be* the contract: derived deterministically from the screens,
handed to noir's builders, used to wire the live screen, and checked against the built app.

That starts with a catalog format of our own: canonical, strongly typed, plain TypeScript. Our renderer and editor
(tasting) support only the components it defines. This part builds the format and the translator that turns it into
what the A2UI SDK needs. The later parts (roadmap below) build on it, so the format must already be able to say
everything they need, even though nothing infers or checks yet.

## Goals (part 1)

1. A typed catalog format in roux-web, plain TypeScript (no Zod in the model), able to express: the type language,
   generic primitives, field references into a generic's type, which props may be bound / must be literal / are
   events, props valid only inside certain parents, and paths relative to a list item.
2. Today's 12 primitives defined in it, with Row and Column gaining the basic catalog's layout model.
3. A translator from our catalog to what `@a2ui/web_core` consumes: the A2UI v1.0 catalog document (JSON) and the
   `ComponentApi` list (Zod 3 schemas), plus the component descriptions the drawing prompt uses.
4. tasting uses the generated catalog in place of its hand-written `src/shared/catalog-api.ts`, with no change in
   what validates.

## Non-goals (part 1)

- Inference, screen contracts, annotations, runtime wiring, moving the React implementations, checking the Go side
  (parts 2–5).
- Supporting A2UI's basic catalog or agents that speak only it. It is reference material: we borrow its ideas where
  they fit and keep our own shapes where they work better.
- Changing the A2UI wire format. Messages, bindings and actions stay exactly A2UI.
- A general type system: only what business screens need.
- New primitives beyond the layout props below (Divider, Image, Tabs, Modal, CheckBox, … come when a screen needs
  them).

## Anti-goals

- Two definitions of anything. Each primitive is written once; JSON, Zod 3 schemas and prompt text are generated.
- A format that can't carry what parts 2–5 need, so it has to be redone.
- Two components that do the same job, for the agent to choose between.

## Constraints

- A2UI v1.0 wire format; `@a2ui/web_core` 0.16.x. Its `ComponentApi.schema` is **Zod 3** (it bundles zod 3.25.76 and
  converts schemas with `zod-to-json-schema`), so Zod 3 appears only in the translator's SDK output (tasting already
  aliases it as `zod3`). Our own validation, later, is Zod 4 via roux-web's rules.
- Bindings are JSON-pointer `{"@path": …}`; custom catalog metadata goes in `extensions` (keys starting `a2ui_` are
  reserved).
- Multi-row data is always paged (`PageDto<T> = {data, pagination}`).
- roux rules: no warning suppression, no star imports, roux's lint and coverage gates.

## Approaches

- **Our own plain-TypeScript type model; translate to A2UI (chosen).** One definition per primitive, shaped for our
  runtime. The model can say things neither Zod nor JSON Schema can (generics, field-of, parent-dependent props), and
  the translator lowers them.
- **Zod 4 as the format.** Familiar, and roux-web's rules are Zod 4, but Zod can't express generics, field references
  or parent rules, and web_core needs Zod 3 anyway — we'd be translating Zod to Zod while bolting metadata on.
- **Import the basic catalog and type it with an overlay.** Interoperability we don't need, at the cost of an
  importer, an overlay and upstream shapes that fit our runtime poorly (single-child Card, list-valued single
  choice, literal-only options).

## Design

### Type language

Scalars are named after roux-web's form rules, so a type, its input field and its checks line up (part 2 builds the
Zod 4 checkers from those rules): `text`, `email`, `url`, `phone`, `date`, `time`, `number`, `integer`, `money`
(`{minorUnits, currency}`), `id`, `boolean`, `oneOf([...])`. Composite types: optional, records (`{field: type}`,
optionally named), `list(T)` (a page: `{data, pagination}`), `options(T)` (a capped set of `{value, label}`), arrays
of literals, and type parameters.

### Prop kinds

Each prop is one of:

- **bindable** — a literal of its type, or `{"@path"}` to a value of its type (A2UI's `Dynamic*`);
- **literal** — must be written in the component (`columns`, `format`);
- **event** — an A2UI `Action`; its context's paths are typed in part 2;
- **children** — a fixed list of ids, or a **template** `{path, componentId}`: one child per item of the list at
  `path`, with paths inside the template relative to the item;
- **child-of** — valid only when the parent is one of the named primitives (`weight` inside Row/Column).

### Primitives

Defined with a small builder (names illustrative):

```ts
component("DataTable")
  .generic("T")
  .prop("rows", bindable(list(T)))
  .prop("columns", literal(array({ header: text, field: fieldOf(T), format: oneOf(["text", "money", "date", "badge"]).optional() })))
  .describe("A paged, sortable table of records. …")
```

The 12, with today's props and descriptions unless noted: Column, Row, Heading, Text, Card, Stat, Button, DataTable,
CardList, Form, InputField, SelectField.

- **Row / Column** take the basic catalog's layout: `justify` (start, center, end, spaceBetween, spaceAround,
  spaceEvenly, stretch), `align` (start, center, end, stretch), template children, and `weight` on their children
  (child-of Row/Column, like flex-grow). They keep `gap`, and Row keeps wrapping on narrow screens.
- **Kept as ours:** Card keeps `children`, title and tone; SelectField binds `options` to data and holds one value;
  InputField keeps `type` (email, tel, date, time) and `serverError`; `@checks` stay the v1.0 checks.

Rules that span props (a column's format must fit its field's type) are recorded on the primitive as data, for part
2 to check.

### The translator

`toA2ui(catalog)` produces:

- **`componentApis`** — web_core `ComponentApi[]` (`{name, description, schema}` with Zod 3 schemas built from the
  v1.0 `CommonSchemas`), so `new Catalog(id, "1.0", componentApis, V10_VALIDATION_FUNCTION_IMPLEMENTATIONS)` works as
  tasting's does today;
- **the catalog document** — via web_core's `generateValidationSchema`, under our catalog id, with our full typing
  in `extensions.roux`;
- **prompt text** — each primitive's name, description and props, for the drawing prompt.

Lowering, where A2UI can't say what we say: a bindable `T` → the matching `Dynamic*` (`text` → `DynamicString`,
`number`/`integer` → `DynamicNumber`, `boolean` → `DynamicBoolean`, anything else → `DynamicValue`); `fieldOf(T)` →
string; a type parameter → its loose form; child-of → a plain optional prop; template children → `ChildList`.

### Where it lives

roux-web, `@jwcarman/roux-web/a2ui` (format, primitives, translator). tasting depends on it, replaces
`catalog-api.ts` with the generated `componentApis`, and takes prompt text from it.

## How we'll know

- `new Catalog(...)` accepts the generated `componentApis`, and `generateValidationSchema` produces a document that
  validates against `catalog_definition.json`.
- Equivalence with today: every existing tasting test fixture and storyboard that validates today still validates,
  and every one that is rejected is still rejected. Prompt text matches today's descriptions, apart from the
  Row/Column layout additions.
- The format can express each later need, shown by tests on the model itself: DataTable's `fieldOf(T)`, a template's
  item-relative paths, `weight` as child-of.

## Roadmap the format must leave room for

2. **Bottom-up inference and screen contracts.** Primitives are typed by hand; a composite's params are inferred from
   where they're used inside it (unify; a conflict is an error naming both uses; an unfixed param stays generic); a
   screen is a composite with no params, and its free paths and events are its contract (list/get/options queries,
   commands with input types). Annotations from the drawing agent supply what inference can't (required, enum,
   email/money/id, record names). Typed composites become catalog entries. Moment data is checked against the types.
3. **Implementations in roux-web.** One Chakra implementation per primitive, props typed from the catalog, serving
   preview and live; merges tasting's look-only copy and the spike's live fork; preview fixtures for lists become
   pages.
4. **Runtime wiring from the bindings.** Paths become query ports, events become command calls; per screen only
   names remain; responses checked against types in development.
5. **Checking the built app.** The Go side's `contract.gen.ts` must provide everything the derived contract needs;
   a mismatch fails the build.

## Left to the builder

Builder API names and shape; how the type model is represented internally; the exact `extensions.roux` shape; prompt
text layout (within "matches today").

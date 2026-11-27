# Surfaces

**An app's feature screens are surfaces.** A surface is a screen drawn, not coded: an
[A2UI](https://a2ui.org) JSON document made only of components from roux's catalog
([The A2UI catalog](a2ui-catalog.md)). Three files make one live:

- `<id>.surface.json`, the drawing: which components, in what layout, each prop written or bound to
  a path in the surface's data;
- `<id>.surface.gen.ts`, generated from the drawing and the typed catalog: what the surface needs
  from outside, the data at each top-level path and what each event carries;
- `<id>.binding.ts`, written: each path filled from a query ([Queries and commands](cqrs.md)) or
  kept locally, each event run as a command. The TypeScript compiler checks it against the
  generated types and the app's contract.

`<Surface>` renders the JSON with roux's catalog components and runs the binding. React is written
only for new catalog primitives (in roux-web) and roux's built-in pages: sign-in, users, appearance.
When a screen needs something the catalog can't draw, the fix is a new primitive
([Adding a primitive](adding-a-primitive.md)), never a hand-written screen.

Every step from the drawing to the running screen is deterministic: the types are generated, the
binding is compiled, and the JSON that was drawn is the JSON that runs. A change to a screen is a
JSON diff.

## Setting up an app

Once per app, before its first surface:

- **The SDK.** `@a2ui/react` and `@a2ui/web_core` (the A2UI SDK) and Zod 3 under the alias `zod3`,
  which web_core's schemas are built on. They are roux-web's optional peers, so an app without
  surfaces doesn't install them:

  ```bash
  npm install @a2ui/react@^0.16.1 @a2ui/web_core@^0.16.1 zod3@npm:zod@^3.25.76
  ```

- **The scripts.** `"surfaces": "roux-surface-types src/**/*.surface.json"` writes every
  surface's types; `"surfaces:check": "roux-surface-types --check src/**/*.surface.json"` fails
  naming a stale one, for CI. The shell's glob reaches one folder down, which is where surfaces
  live: `src/<feature>/<id>.surface.json`.
- **Vite's chunks.** The SDK is large (about 500 kB minified, with Zod 3). Without help Vite bundles
  it into the first surface's route chunk and warns that the chunk is over 500 kB. The app's
  `vite.config.ts` puts it in chunks of its own, which the browser fetches once and caches apart
  from the app's code:

  ```ts
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "a2ui", test: /node_modules[\\/]@a2ui[\\/]web_core[\\/]src/ },
            { name: "zod3", test: /node_modules[\\/](zod3|@a2ui[\\/]web_core[\\/]node_modules[\\/]zod)[\\/]/ },
          ],
        },
      },
    },
  },
  ```

- **The contract.** `cmd/server/contract_test.go` writes `frontend/src/contract.gen.ts` from the
  app's endpoints ([Queries and commands](cqrs.md#the-contract)). It and the surfaces' types are
  generated, so `frontend/.prettierignore` lists `src/contract.gen.ts` and `src/**/*.surface.gen.ts`.
- **The binder.** `frontend/src/surfaces.ts` makes the app's `bind` once from the contract:

  ```ts
  import { surfaces } from "@jwcarman/roux-web/surface";
  import { contract, type Commands, type Queries } from "./contract.gen";

  export const { bind } = surfaces<Queries, Commands>(contract);
  ```

  The contract is a type parameter the app supplies, not something roux-web imports. `contract` is
  a `ContractEvents`: what the runtime needs at run time, each query's `kind` and `dependsOn` and
  each command's `emits`.

## Drawing a surface

```json
{
  "id": "items",
  "components": [
    { "id": "root", "component": "Column", "children": ["title", "counts", "table", "addCard"] },
    { "id": "title", "component": "Heading", "text": "Items", "size": "xl" },
    { "id": "counts", "component": "Row", "children": ["openCard"] },
    { "id": "openCard", "component": "Card", "children": ["openStat"] },
    { "id": "openStat", "component": "Stat", "label": "Open", "value": { "@path": "/counts/open" } },
    {
      "id": "table",
      "component": "DataTable",
      "rows": { "@path": "/items" },
      "pageIndex": { "@path": "/itemsArgs/pageIndex" },
      "columns": [
        { "header": "Day", "field": "day", "format": "date", "sort": "DAY" },
        { "header": "Title", "field": "title", "link": { "to": "/items/$itemId", "params": { "itemId": "id" } } }
      ]
    },
    { "id": "addCard", "component": "Card", "title": "Add item", "children": ["addForm"] },
    { "id": "addForm", "component": "Form", "children": ["draftTitle", "add"] },
    {
      "id": "draftTitle",
      "component": "InputField",
      "label": "Title",
      "value": { "@path": "/draft/title" },
      "serverError": { "@path": "/errors/title" }
    },
    {
      "id": "add",
      "component": "Button",
      "label": "Add item",
      "action": { "event": { "name": "addItem", "context": { "title": { "@path": "/draft/title" } } } }
    }
  ]
}
```

A surface (a `SurfaceJson`, `{ id, components }`) is a flat list of components (each a
`SurfaceComponent`, `{ id, component, ...props }`) that name their children by id; `root` is drawn
first. A prop is written literally, or bound to the surface's data with `{"@path": "/..."}`. The
top-level paths are the surface's data, one per source: a query's answer (`/items`, `/counts`), a
query's args (`/itemsArgs`), a form's draft (`/draft`), the server's word on each field (`/errors`).

A button's `action` is an event: a name the binding gives a command, and a `context` that carries
values from the data to it. A field's `@checks` are its client rules (`required`, `length`,
`regex`, `email`, `numeric`), each with its message in roux's words, the same the server's
`Validate` answers ([Forms](forms.md)).

A `FilterChips` bound to a query's arg (`"value": {"@path": "/itemsArgs/when"}`) filters that query: choosing a
chip writes its value to the arg, and the list answers again. It needs no `Form`.

The catalog's components and their props are listed in [The A2UI catalog](a2ui-catalog.md). A
misspelled prop passes A2UI's validation and draws nothing, so copy props from there.

Three props shape how a screen looks: a `Stat`'s `tone` (`accent` or `danger`) colors its number unless
it is zero or empty; a DataTable column's `emptyText` is what a cell shows, muted, when its value is
missing (`null`, `""` or an empty list); and a Button in a Row takes its own width and lines up with
the bottom of the fields beside it.

## The generated types

`npm run surfaces` runs `roux-surface-types` on every surface, writing `<id>.surface.gen.ts` beside
each `<id>.surface.json`:

```ts
// Generated from items.surface.json and the typed catalog. Do not edit.
import type { IsoDate, Pagination } from "@jwcarman/roux-web/surface";

export interface ItemsSurfaceData {
  counts: { open: number };
  itemsArgs: { pageIndex: number };
  items: { data: { day: IsoDate | null; title: string | null; id: string }[]; pagination: Pagination };
  draft: { title: string };
  errors: { title: string };
}

export interface ItemsSurfaceEvents {
  addItem: { title: string };
}
```

Each bound prop's catalog type says what its path must hold, and the uses of each top-level path
merge into one type. A table's rows are a page (`{data, pagination}`); its row type comes from the
fields its columns name, typed by each column's `format` (`date` → `IsoDate`, `money` → `Money`,
no format → `string`, `null` for an empty cell); a `link`'s params are fields the row must have. A
`Stat`'s value is its format's type, a `number` by default. An event's type is its context, each
value typed from the data. One path used as two different types is an error naming the path and
both uses; a surface the generator can't type is refused, never guessed. Paths are absolute
(`"/draft/name"`; a relative `"name"` is an error), and a Column or Row lists its children by id (a
`{componentId, path}` template is an error until surfaces support them).

`roux-surface-types --check` writes nothing and exits 1 naming each generated file that is missing
or stale, with the command that fixes it. The command's logic is `runSurfaceTypes(args, io)`, with
its file access passed in as a `SurfaceTypesIo`; the generator itself is
`surfaceTypes(surface, defs)`, from `@jwcarman/roux-web/a2ui`. `IsoDate`, `Money` and `Pagination`
are exported from `@jwcarman/roux-web/surface` for the generated files.

## The binding

```ts
import { bind } from "../surfaces";
import type { ItemsSurfaceData, ItemsSurfaceEvents } from "./items.surface.gen";

export const itemsBinding = bind<ItemsSurfaceData, ItemsSurfaceEvents>(({ d, query, local, command, none }) => ({
  data: {
    items: query("items", { pageIndex: d.itemsArgs.pageIndex }),
    counts: query("itemCounts"),
    itemsArgs: local({ pageIndex: 0 }),
    draft: local({ title: "" }),
    errors: local({ title: "" }),
  },
  events: {
    addItem: command("addItem", (item) => ({ title: item.title, day: "" }), {
      errors: d.errors,
      onSuccess: [{ reset: d.draft }, { toast: "Item added" }],
    }),
  },
}));
```

- `d` is the surface's data as typed paths: `d.itemsArgs.pageIndex` is a `Ref` to
  `/itemsArgs/pageIndex`.
- `data` names every top-level path. `query(name, args)` fills it from a query or lookup; each arg
  is a value, or a path the arg is read from. `local(initial)` is a value the surface keeps itself.
- `events` names every event. `command(name, build, { errors, onSuccess })` runs the command with
  the input `build` makes from what the event carries; `none()` leaves an event for later, and
  clicking it says it isn't bound yet.
- `errors` is the path field problems go under (`/errors/title`). `onSuccess` steps run in order:
  `{ reset: d.draft }` puts a path back to its `local` value, `{ set: d.x, value }` sets one,
  `{ toast: "..." }` tells the person.

It does not compile when a path or an event is left out, when a query's answer lacks a field the
surface shows, when an arg isn't one the query takes, or when a command's input misses a member: the
error is at the binding's line, naming what's missing. `bind` returns a `Binding`, which only
`<Surface>` reads.

Define each binding at module level. A `bind()` inside a component, or anywhere in render, is a new
binding on every render, and a new binding restarts the surface.

## Rendering

```tsx
export const Route = createFileRoute("/_signedIn/items/")({
  beforeLoad: ({ context }) => requirePermission(context.me, ITEMS_READ),
  component: () => <Surface surface={itemsSurface} binding={itemsBinding} />,
});
```

A surface page gets the wide column of the `AppShell` (`useWidePage`, see the shell guide); built-in pages keep
the narrow one.

`<Surface>` draws the JSON with `surfaceComponents`, the catalog's Chakra implementation, through the
A2UI React renderer, on a data model that starts from the binding's `local` values. It belongs in a
route: a table's `link` columns are TanStack Router links.

What the runtime does, so the drawing doesn't have to:

- **Queries** run through TanStack Query, keyed by name and resolved args. A change to a path an arg
  reads refetches; a change to any arg but the page sets the page back to 0, since page 3 of the old
  filter is not a page of the new one. The last page stays on screen while the next loads.
- **Loading.** This round the surface shows a skeleton until each of its queries has answered once.
  A first-load failure shows the error with Retry in its place. (A skeleton and an error at each
  query's own place on the surface come later.)
- **Commands** run one at a time per event, each with an `Idempotency-Key`: a fresh key per attempt,
  kept after a failure so a retry reuses it, renewed after a success. A key reused after a network
  failure replays the stored result even if the draft changed since ([Queries and
  commands](cqrs.md#the-command-log-and-idempotency)).
- **After a success** the queries that depend on the command's events refetch, and then `onSuccess`
  runs, so the toast comes once the list shows the change.
- **Refusals.** A `problem.Validation` writes each message under `errors`, by field. Any other
  refusal, or a field problem with no place under `errors`, is roux's error toast, and the form keeps
  what was typed. A lost session goes to sign-in, as everywhere in roux-web.

## Testing

A surface is tested through its route, with MSW answering in the server's shapes, as the rest of an
app's front end is ([Testing](testing.md)):

```tsx
server.use(
  http.get("/api/queries/labels", () => HttpResponse.json(pageOf(rows, { pageIndex: 0, pageSize: 25 }))),
  http.post("/api/commands/addLabel", () => HttpResponse.json({ result: { id: "l-2" }, events: ["labelsChanged"] })),
);
renderRoute("/labels", { permissions: [LABELS_READ, LABELS_MANAGE] });
const table = await screen.findByRole("table", {}, { timeout: 5000 });
```

Test what the person does: the list and what each filter asks for (the request's query string), an
add (the command's body, the refreshed list, the toast, the cleared draft), a server field error
under its field (`invalidFields`), and the guard. The first render loads the A2UI runtime, so the
first wait gets a longer timeout. Playwright tests drive the same screen in a browser.

## Known limits

This round, a surface can't do everything a hand-written page could:

- **No permission gating inside a surface.** A person without the write permission sees the form;
  the server refuses the command (`403`) and the refusal is toasted. Guard the whole route with
  `requirePermission`.
- **No detail surfaces, modals, tabs or composites.** A surface has no route parameters yet, so a
  screen about one record (Roux The Day's item page) stays React for now. A table's column can link
  to such a page.
- **Client checks don't block a submit.** They show on blur; the server's `Validate` is what stops a
  bad save, and its messages show under the fields.

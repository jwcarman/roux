# Surfaces: a feature's screens

An app's feature screens are **surfaces**: A2UI JSON drawn only from roux's catalog
(`<id>.surface.json`), its types generated from it (`<id>.surface.gen.ts`), and a binding written
in TypeScript (`<id>.binding.ts`) that fills each path from a `cqrs` query or a local value and runs
a `cqrs` command for each event. `<Surface>` renders it. React is written only for catalog
primitives and roux's built-in pages. The recipe (`feature.md` steps 0 and 7 to 10) builds one.

## Rules

- The JSON is the screen; TypeScript only binds it. Never write a feature screen, form or list in
  React; never compile the JSON to React.
- Draw only with the catalog's components and props (below). When a screen needs something the
  catalog can't draw, add a primitive (below): never a hand-written screen.
- Run `npm run surfaces` after every change to a surface's JSON; never edit `*.surface.gen.ts`.
  CI's `npm run surfaces:check` fails naming a stale one.
- Define each binding at module level (`export const labelsBinding = bind(...)`). A `bind()` inside a
  component, or in render, is a new binding each render, which restarts the surface.
- Top-level paths are the surface's data, one per source: the query's page (`/labels`), its args
  (`/labelsArgs`), a form's draft (`/draft`), the server's field errors (`/errors`).
- A field's client check (`@checks`) uses roux's word for the rule (`Must not be blank`), and the
  command's `Validate` checks the same rule.
- A surface lives at `frontend/src/<feature>/<id>.surface.json` (the scripts' glob is
  `src/**/*.surface.json`, one folder down).

## Names

- From `@jwcarman/roux-web/surface`:
  - `surfaces<Queries, Commands>(contract)` → `{ bind }`, made once in `src/surfaces.ts` from
    `contract.gen.ts` (`contract` is a `ContractEvents`: each query's `kind` and `dependsOn`, each
    command's `emits`).
  - `bind<XSurfaceData, XSurfaceEvents>(({ d, query, local, command, none }) => ({ data, events }))`
    → a `Binding`. `d` is the surface's data as typed paths (a `Ref`): `d.labelsArgs.colour` is
    `/labelsArgs/colour`.
  - `data`: every top-level path is `query(name, args?)` (args are values or `d` paths) or
    `local(initial)`.
  - `events`: every event is `command(name, (context) => input, { errors?, onSuccess? })` or
    `none()` (bound later; clicking it says so). `errors` is a `d` path: each field problem the
    server answers is written to `<errors>/<field>`. `onSuccess` steps, in order: `{ reset: d.x }`
    (back to its `local` value), `{ set: d.x, value }`, `{ toast: "..." }`.
  - `<Surface surface={json} binding={binding} />`: renders it, in a route's `component`.
  - `IsoDate`, `Money`, `Pagination`: the value types the generated files name.
  - `surfaceComponents`: the catalog's React implementation (`Catalog<ReactCatalogComponent>`).
- From `@jwcarman/roux-web/a2ui`: `SurfaceJson` (`{ id, components }`), `SurfaceComponent`
  (`{ id, component, ...props }`), `surfaceTypes(surface, defs)` (the generated text; a path used
  as two types throws), `runSurfaceTypes(args, io)` with `SurfaceTypesIo` (the bin's logic).
- The bin: `roux-surface-types <file.surface.json>...` writes each `<id>.surface.gen.ts`
  (`<Id>SurfaceData`, `<Id>SurfaceEvents`); `--check` writes nothing and exits 1 naming each stale
  file. The app's scripts: `npm run surfaces`, `npm run surfaces:check`.

## The catalog

Components (`a2ui-catalog.md` has their definitions): `Column`, `Row` (`children`, `gap`, `justify`,
`align`; a child's `weight`), `Heading` (`text`, `size`), `Text` (`text`, `muted`), `Card` (`title`,
`tone`, `children`), `Stat` (`label`, `value`, `format` `number`/`money`), `Button` (`label`,
`action`, `variant`, `disabled`), `DataTable` (`rows`, `columns`, `pageIndex`, `sortBy`,
`sortDirection`, `emptyText`: `lists.md`), `CardList` (`rows`, `title`, `lines`, `badge`,
`emptyText`), `Form` (`children`), `InputField` (`label`, `value`, `type` text/email/tel/date/time,
`required`, `helperText`, `serverError`, `@checks`), `SelectField` (`label`, `value`, `options`
`[{value, label}]`, `placeholder`, `required`, `helperText`, `serverError`, `@checks`). Every
`InputField` and `SelectField` is inside a `Form`.

A prop is bound with `{ "@path": "/draft/name" }`; a button's action is
`{ "event": { "name": "addLabel", "context": { "name": { "@path": "/draft/name" } } } }`, and the
context is what the event carries to its command's `build`.

## What the runtime does

- Each query runs through TanStack Query, keyed by its name and resolved args; a change to a path an
  arg reads refetches, and any change but the page's sets the page back to 0. The last page stays
  while the next loads.
- Loading: the surface shows a skeleton until each of its queries has answered once. A first-load
  failure shows the error with Retry in its place.
- A command runs once at a time per event, with an `Idempotency-Key`: a fresh key per attempt, kept
  after a failure (a retry reuses it), renewed after a success. A key reused after a network failure
  replays the stored result even if the draft changed since (`cqrs.md`).
- On success: the queries whose `DependsOn` meets the command's events refetch, then `onSuccess`
  runs. A `problem.Validation` writes each message under `errors` by field; any other refusal, or a
  field with no place under `errors`, is roux's error toast. The draft keeps what was typed.

## Known limits (this round)

- No permission gating of parts of a surface: a user without the write permission sees the form,
  and the server refuses it (`403`, toasted). Guard the whole route with `requirePermission`.
- No detail surfaces (route parameters), modals, tabs or composites. A `DataTable` column may link
  to a route (`link`).
- Client checks show on blur but don't block a submit: the server's `Validate` is the gate.

## Adding a primitive

When a screen needs something the catalog can't draw, the fix is a new catalog primitive in
roux-web (an app has no catalog of its own): its typed definition in `src/a2ui/primitives.ts`
(`component(...)...describe(...).build()`, added to `PRIMITIVES`), its Chakra implementation in
`src/surface/components/` (`defineComponent(rouxCatalog.apis.X, render)`, added to its group's list
so `surfaceComponents` has it), tests to roux-web's 100% coverage and mutation score, and both
`a2ui-catalog` docs. Tell the user the screen waits on that change; don't draw around it in React.

## Pitfalls

- A query answer lacking a field the surface shows, a path or event missing from the binding, a
  command input missing a member: `npm run build` fails at the binding's line. Fix the binding, the
  surface or the Go types, then regenerate (`go test ./cmd/server` twice, `npm run surfaces`).
- One path used as two types (a text in one prop, a number in another): `npm run surfaces` refuses,
  naming the path and both uses.
- A misspelled prop name passes A2UI's validation and draws nothing: copy props from this card.
- Two fields with one label on a surface: tests that find by label fail; give each its own.
- A `link` column outside the app's router: render surfaces in routes.

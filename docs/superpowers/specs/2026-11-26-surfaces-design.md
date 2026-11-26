# Surfaces: A2UI screens bound to typed queries and commands

Status: design, awaiting approval. Builds on `2026-11-26-typed-catalog-design.md` (part 1, branch
`typed-catalog`) and is proven first in `runtime-spike` (commits `a7fa4c2`, `89793d1`).

## Intent

A screen should be drawn, not coded: an A2UI surface (JSON) made only of components from roux's typed
catalog. Something has to make that drawing live, bound to the app's real data and actions, with the
same type safety hand-written code gets. This design is that something, in roux:

- **cqrs (Go):** typed queries and commands, one HTTP shape, a contract generated from the Go types.
- **Surface types (roux-web):** generated, deterministically, from the surface's JSON and the typed
  catalog. They say what the surface needs from outside: the data at each top-level path, and what
  each event carries.
- **bind (roux-web):** a small typed file that maps each path to a query or local state and each event
  to a command. The TypeScript compiler checks it against the surface types and the contract.
- **Surface (roux-web):** one generic runtime that renders the JSON with roux's catalog components and
  executes the binding.

**Surfaces are the way to build an app's feature screens** (decided 2026-11-26). An app's own screens
are surface JSON plus a binding; React is written only for new catalog primitives and for roux's
built-in pages (sign-in, users, appearance). When a screen can't be drawn from the catalog, the fix is a
new primitive (typed, implemented, tested, added to the catalog), never a hand-written screen.

The goal of this round is to see it run in a real roux app (Roux The Day's items, drawn as a surface,
fully working) and to make roux teach it as the one way.

## Goals

- An A2UI surface in Roux The Day, on screen, bound to cqrs queries and commands, fully functional:
  paging, a filter, adding an item, field errors from the server, the list refreshing after a change.
- Every step between the drawing and the running screen is deterministic: generation, not a model.
- A wrong binding fails to compile, at the line to fix, naming what's missing.

## Non-goals

- noir and tasting. Neither changes this round.
- The template app's own screens: it has no feature screens, only roux's built-in pages, which stay React.
- Detail screens with route parameters, modals, tabs, composites. Later rounds; until then Roux The
  Day's item detail page stays React (the only hand-written feature screen left, on purpose, for now).

## Anti-goals

- Writing screens in TypeScript. The JSON is the screen; TypeScript only binds it.
- Anything that guesses. A surface the generator can't type is an error naming the fix.
- A second data layer: the runtime uses TanStack Query, as the rest of roux-web does.

## Approaches considered

- **Run the JSON (chosen) vs. compile it to React vs. fetch it at run time.** Running the committed JSON
  keeps "what was drawn is what runs" and makes a change a JSON diff. Compiled React drifts from the
  drawing on its first hand edit; JSON fetched at run time is unversioned and untested.
- **Generated surface types plus a typed binding (chosen) vs. a naming convention** (a path named like
  its query, an event like its command). The binding keeps names free (an event `saveItem` may run
  `addItem` with extra inputs) and lets the compiler do the checking; the convention needs its own
  checker and makes the drawing know the server's names.
- **The screen written as a TypeScript DSL** (tried in the spike, `a7fa4c2`): rejected. The drawing has
  to be the A2UI JSON.

## The design

### 1. `cqrs` (Go package `github.com/jwcarman/roux/cqrs`)

Ported from the spike's `internal/cqrs` and hardened.

- `Query[A, R]`: a paged read. `Run(ctx, db page.Querier, req page.Request, search string, args A)
  (page.Page[R], error)`, with `Paging page.Config` (a `page.Paginator`'s `Config()`).
  `GET /api/queries/{name}` with roux's page parameters plus `A`'s fields; answers `page.Page[R]`.
- `Lookup[A, R]`: a read that isn't a list (a summary, one record, a short set of options).
  `GET /api/queries/{name}`; answers `R`.
- `Command[I, O]`: a change. `I` implements `Validate() (I, error)`, answering `problem.Validation`
  with each violation's field the input's JSON member. `Run` gets a `pgx.Tx`.
  `POST /api/commands/{name}`; answers `{result: O, events: []string}`.
- Every endpoint has a `Name`, a `Permission`, and is mounted as its own kit route, so roux's sign-in,
  permission and CSRF checks apply per name. A query lists the events it `DependsOn`; a command lists
  the `Events` it emits.
- Args: `A`'s fields tagged `query:"name"`, optional `oneof:"a,b"`. An unknown parameter or a value
  outside `oneof` is a 400 on that parameter.
- Idempotency: a command request may carry `Idempotency-Key` (a UUID). The key and the answer are
  stored in the command log in the command's own transaction; a repeat answers the stored answer. The
  log's table comes with `cqrs.Module`, which an app turns on before any module that registers commands.
- Stale writes: a command whose input carries a `version` that no longer matches answers roux's
  existing conflict problem (409).
- `cqrs.Mount(k, endpoints...)` registers them; a duplicate name panics at start-up, naming both.
- **The contract:** `cqrs.TypeScript(endpoints)` writes `contract.gen.ts`: an interface per Go type the
  endpoints name (from JSON tags; a pointer is an optional member in an input, nullable elsewhere) and
  `Queries` / `Commands` maps (kind, args or input, row or result, events). An app's test compares it
  with the committed file and fails naming the command that regenerates it.

### 2. Surface types (roux-web `./surface`)

- `surfaceTypes(surface, defs): string` — deterministic. For each component, each bound prop's
  catalog type says what its path must hold; the types merge into one tree per top-level path.
  - A generic component's row type comes from the fields its literal props name (a column's `field`)
    and their `format` (`date` → `IsoDate`, `money` → `Money`, no format → `string`).
  - A Stat-like generic with no field takes its format; none → `number`.
  - A field is required. One path used as two types is an error naming the path and both uses.
  - An event's type is its context: each `{"@path"}` typed from the tree.
- Output: `<id>.surface.gen.ts` with `<Id>SurfaceData` and `<Id>SurfaceEvents`, stable in order.
- A bin, `roux-surface-types <file.surface.json>...`, writes them. The app's check regenerates and
  fails if a committed file differs.

### 3. `bind` (roux-web `./surface`)

As in the spike: `bind<Data, Events>(({ d, query, local, command, none }) => ({ data, events }))`.

- `d` is typed paths into the surface's data (`d.itemsArgs.when` is `/itemsArgs/when`).
- `data` must name every top-level path: `query(name, args)` (args typed by the contract, values or
  paths) or `local(initial)`. A query's answer must be assignable to what the surface shows.
- `events` must name every event: `command(name, (context) => input, { errors, onSuccess })` or
  `none()`. `onSuccess` steps: `reset(path)`, `set(path, value)`, `toast(text)`.
- The contract is a type parameter the app supplies once, not an import roux-web makes.

### 4. The runtime (roux-web `./surface`)

- `<Surface surface={json} binding={binding} />` renders the JSON with roux's catalog components through
  the A2UI React renderer, on a data model that starts from the binding's `local` values.
- Queries run through TanStack Query, keyed by name and resolved args; a change to a path an arg reads
  refetches. A command runs as a mutation with a fresh `Idempotency-Key`; on success, the queries whose
  `DependsOn` meets the command's `events` are invalidated, then `onSuccess` runs. A
  `problem.Validation` fills the `errors` path by field; any other failure is roux's error toast.
- The runtime, not the drawing, owns the states: loading (a skeleton where a query's data goes), a
  failed query (an inline error with retry), forbidden.
- **The catalog's implementations move into roux-web**: the Chakra components tasting renders today
  (`layout`, `data`, `form`), so the surface, tasting and the spike all render with the same code.
  Paging a `DataTable` writes its `pageIndex` path.
- **A `DataTable` column may link** to a route of the app: `link: {to: "/items/$itemId", params:
  {itemId: "id"}}`, the params naming row fields (typed by the generator like any `fieldOf`). The
  runtime navigates with TanStack Router.

### 5. Proof: Roux The Day

- `internal/items` gains cqrs endpoints beside its REST handlers, sharing its `Service`:
  `items` (Query; args `when`, `status`, `assignee`), `itemCounts` (Lookup; open, overdue, today) and
  `addItem` (Command; title, day; assigned to the caller; emits `itemAdded`).
- The surface **replaces** the hand-written items list at `/items` (`ItemsPage.tsx`, `AddItem.tsx` and
  what only they use are deleted); the nav is unchanged. Titles link to the item's detail page.
- `frontend/src/items/items.surface.json` — drawn from the catalog: counts as Stats, the list as a
  paged DataTable (When, Title, Assignees, Status), a SelectField for "when", an add form with title
  and a date InputField.
- `items.surface.gen.ts` (generated), `items.binding.ts` (written).
- Playwright: load, page, filter, add (list and counts update), a blank title (client check), a server
  error under its field.

### 6. Docs and skill

Guides and skill references for `cqrs`, surface types, `bind` and `<Surface>`, as roux requires
(`check-guides.mjs`), stating the rule: an app's feature screens are surfaces.

- **The recipe is rewritten** (`references/feature.md`, `references/lists.md`, proven by
  `check-recipe.sh`): a feature is a migration, cqrs queries and commands, a surface drawn from the
  catalog, its generated types and its binding. No feature-specific React.
- The guides that taught screens in React (features, lists, forms) are rewritten the same way; the React
  components they described stay in roux-web as the catalog primitives' implementations.
- A guide, "Adding a primitive", for the escape hatch.

## Constraints

- roux's gates: `make check`; roux-web 100% coverage and 100% mutation score; Roux The Day's front-end
  gates; `check-guides.mjs`, `check-recipe.sh`.
- roux's design rules: errors say what to do, the wrong way fails loudly, exact names alike in Go,
  roux-web and the docs.
- Zod 3 only where the A2UI SDK needs it; definitions and generated types are plain TypeScript.
- Pre-1.0: no back-compat shims.

## Order of work

1. `cqrs` in roux (Go) with the contract generator.
2. Catalog implementations into roux-web; tasting switched to them.
3. Surface types generator and its bin.
4. `bind` and `<Surface>`.
5. Roux The Day's items surface, end to end, replacing the hand-written list.
6. Docs and skill, including the rewritten recipe.

## Left to the builder

- File layout inside each package, test structure, the bin's argument handling.
- How the skeleton and inline error look, within roux-web's existing feedback components.

## Open (not this round)

- Queries and commands are the app's ports (ports and adapters). Other adapters may drive them later: agent tools (the PM agent or an owner's assistant running `addItem` with the same validation, permission, idempotency and events), a CLI, scheduled jobs.

- Detail surfaces (route parameters), modals, links between surfaces, composites, options queries.
- Where `typed-catalog` merges: this branch is cut from it.

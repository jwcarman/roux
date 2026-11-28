# cqrs: a feature's queries and commands

Package `github.com/jwcarman/roux/cqrs`. A feature's reads and changes are typed endpoints: a
`cqrs.Query` (a paged list), a `cqrs.Lookup` (one value) and a `cqrs.Command` (a change). They are
**the app's ports** (ports and adapters): `cqrs.Mount` is the HTTP adapter, a surface and its
binding drive it from the browser, and Postgres is a driven adapter behind the domain service.
Later adapters (an agent's tools, a CLI, scheduled jobs) can drive the same endpoints with the same
validation, permission, idempotency and events. The recipe (`feature.md` steps 3 to 6) builds one
of each kind but the lookup.

## Rules

- A command's `Run` is thin: its input is already validated (`Validate` ran), so `Run` calls the
  feature's domain service, where the rules live (Roux The Day's `addItem` → `items.Service`). A
  rule in `Run` is lost to every other adapter.
- `Run` receives a `pgx.Tx`: the one deliberate impurity. roux is Postgres-only, and the command log
  must commit with the change, so the service writes in that transaction. Never begin another.
- Every endpoint has a `Name` (camelCase, unique in the app; a command's is a verb) and a
  `Permission`. Each is its own kit route: sign-in, permission and CSRF checks apply per name.
- A command's input type implements `cqrs.Input`: `Validate() (I, error)` answers the clean input,
  or `problem.Validation` with each violation's `Field` the input's JSON member. Pointer members
  tell missing from empty.
- Name every type an endpoint names after its feature (`LabelRow`, `AddLabel`): the contract is one
  namespace, and two types of one name panic.
- An endpoint's types are structs with a `json` tag on every exported field (or `json:"-"`); a map
  can't be described. Either mistake panics when the contract is generated, naming the field.
- Events: a command `Emits` the events its success means; a query or lookup `DependsOn` the events
  after which a screen refetches it. One event per kind of change (`labelsChanged`).
- `cqrs.Module{}` is on in the template's `modules.go`, before every feature's module: it is the
  command log's table. Add features after it.
- Each feature's endpoints are one more argument to `endpoints()` in `cmd/server/modules.go`:
  `slices.Concat(labels.Endpoints(labels.Service{}), ...)`. The template's contract test
  (`rouxtest.ContractFile`) writes them into the front end's `contract.gen.ts`. Never edit it.

## Names

- `cqrs.Query[A, R]{Name, Permission, DependsOn, Paging, Run}`: `Paging` is the paginator's
  `list.Config()`; `Run(ctx, db page.Querier, caller *authn.Principal, req page.Request, search
  string, args A) (page.Page[R], error)`. `GET /api/queries/<Name>` with `pageIndex`, `pageSize`,
  `sortBy`, `sortDirection`, `search` and the args; answers `page.Page[R]`.
- `cqrs.Lookup[A, R]{Name, Permission, DependsOn, Run}`: `Run(ctx, db, caller, args A) (R, error)`.
  `GET /api/queries/<Name>`; answers `R`. For counts, one record, a short fixed set of options.
- `cqrs.NoArgs`: the args of a query or lookup that takes none.
- Args `A`: string fields tagged `query:"name"`, with `oneof:"a,b"` for a word from a set. An empty
  value is `""`; an unknown parameter or a value outside `oneof` is a `400` on that parameter. Every
  exported field must be a `string` with a `query` tag: `Mount` and `TypeScript` panic on an `int`/`bool`
  field (parse in `Run`) or an untagged exported field.
- `cqrs.Command[I, O]{Name, Permission, Emits, Run}`: `I` a `cqrs.Input[I]`;
  `Run(ctx, tx pgx.Tx, caller, in I) (O, error)`. `POST /api/commands/<Name>`; answers
  `cqrs.Answer[O]`, `{result: O, events: [...]}`.
- `cqrs.Mount(k, endpoints...)`: serves them (in the module's `Mount`); a repeated name panics at
  start-up naming it.
- `cqrs.Module`: the command log (`Name`, `Migrations`, `Mount`).
- `cqrs.TypeScript(endpoints)`: the text of `contract.gen.ts`: an interface per type, the
  `Queries` and `Commands` types, and the `contract` object (each query's `kind` and `dependsOn`,
  each command's `emits`). An input's pointer member is optional (`?`); elsewhere a pointer is
  `| null`. A struct used both in an input and elsewhere, differently, gets an `<Name>Input`
  interface.
- `cqrs.Endpoint`: a query, lookup or command; its `Describe()` is a `cqrs.Description` (`Kind`,
  `Name`, `Permission`, `Events`, `In`, `Out`), what the generator reads. `cqrs.Kind` is
  `cqrs.KindQuery`, `cqrs.KindLookup` or `cqrs.KindCommand`.
- `cqrs.IdempotencyKey`: the `Idempotency-Key` request header.

## Idempotency

A command request may carry `Idempotency-Key: <uuid>`. The key, the caller and the answer are stored
in the command log inside the command's own transaction, so a key is recorded only when the change
commits. A repeat with the key answers the stored answer with the header `Idempotent-Replayed: true`
and runs nothing, even if its body differs (as Stripe does). The same key from another caller, or
for another command, is a `409`; a key that is not a UUID a `400`.

The surface runtime sends a fresh key per attempt: it keeps the key after a failure (so a retry
after a lost answer can't add twice) and renews it after a success. So a person who edits the form
after a network failure and saves again gets the first attempt's stored result if that attempt did
commit, not their edit.

## Stale writes

`cqrs` has no version check of its own. A command that edits a record from the version it read
takes `version` in its input, and its service compares it under `for update` and answers
`problem.StaleVersion()` (a `409`) when it differs.

## Example

A lookup beside the recipe's query (Roux The Day's `itemCounts`):

```go
cqrs.Lookup[cqrs.NoArgs, ItemCounts]{
	Name: "itemCounts", Permission: ItemsRead, DependsOn: []string{itemsChanged},
	Run: func(ctx context.Context, db page.Querier, _ *authn.Principal, _ cqrs.NoArgs) (ItemCounts, error) {
		return s.Counts(ctx, db)
	},
},
```

## Check

Go tests through `rouxtest`: `a.Migrate(cqrs.Module{}.Migrations()...)`, `cqrs.Mount(a.Kit(),
labels.Endpoints(svc)...)`, then `GET /api/queries/...` and `POST /api/commands/...` with
`a.SignedIn(...)` browsers: the permission (`403`), the input's rules (`400`), the service's rules,
the args' refusals. `go test ./cmd/server` twice rewrites `contract.gen.ts`.

## Pitfalls

- A command without `cqrs.Module{}`, or with it after the feature's module: no command log, a `500`.
- `Run` beginning its own transaction or using the pool: the change and the command log commit
  apart, and a replay can repeat the change.
- `Field` in a violation that is not the input's JSON member: the surface can't place the message
  and toasts it instead.
- A permission no role holds: start-up stops, naming the route.
- A feature's endpoints not added to `endpoints()`: the browser's contract lacks it and the
  binding naming it fails to compile.

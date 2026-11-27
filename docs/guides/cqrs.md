# Queries and commands

A feature's reads and changes are typed endpoints in package `github.com/jwcarman/roux/cqrs`: a
`cqrs.Query` is a paged list, a `cqrs.Lookup` is one value that isn't a list, and a `cqrs.Command` is
a change. Each has a name, a permission, Go types for what it takes and answers, and the events that
tie them together. From the same Go types roux generates the browser's contract, which the
TypeScript compiler checks a screen's binding against ([Surfaces](surfaces.md)).

## Ports and adapters

The queries and commands are **the app's ports**. Everything that uses the feature goes through
them, and everything behind them is the feature's own:

- **Driving adapters** call the ports. `cqrs.Mount` is the HTTP adapter: it serves each endpoint at
  its own URL, behind roux's sign-in, permission and CSRF checks. A surface and its binding drive
  that adapter from the browser. Later adapters can drive the same ports with the same validation,
  permissions, idempotency and events: an agent's tools (a product manager agent, or an owner's
  assistant, running `addItem`), a command-line tool, scheduled jobs.
- **The domain service** is where the feature's rules live: what makes a name unique, which day an
  item is due when none was given, who may see what. The endpoints are thin, so a rule written in
  the service holds whatever drives it.
- **Driven adapters** are what the service uses. In roux that is Postgres.

A command's `Run` stays thin: by the time it runs, its input has been decoded and validated, so it
translates the input into a call on the domain service and returns the result. In Roux The Day,
`addItem`'s `Run` works out today's date when the input has none and calls the items service's
`create`; the rules about items are the service's.

There is one deliberate impurity. `Run` receives the `pgx.Tx` the change is made in, rather than
an abstract repository: roux is Postgres-only, and the command log (below) must commit in the same
transaction as the change, so a replayed request can never repeat a change that already happened.
The service takes that transaction and writes in it; it never begins its own.

## Queries

```go
cqrs.Query[LabelsArgs, LabelRow]{
	Name: "labels", Permission: LabelsRead, DependsOn: []string{labelsChanged}, Paging: list.Config(),
	Run: func(ctx context.Context, db page.Querier, _ *authn.Principal, req page.Request, search string, args LabelsArgs) (page.Page[LabelRow], error) {
		return s.Page(ctx, db, req, search, args.Colour)
	},
}
```

A query is `GET /api/queries/<Name>`. It takes roux's page parameters (`pageIndex`, `pageSize`,
`sortBy`, `sortDirection`, `search`) and its args, and answers a `page.Page[R]`
(`{data, pagination}`). `Paging` is the paginator's rules (`list.Config()` of a `page.New`
paginator, [Tables and paging](tables-and-paging.md)), so a sort the list doesn't know is refused
before `Run`.

The args are a struct of string fields, each tagged with its parameter name, and optionally
`oneof` for a word from a set:

```go
type LabelsArgs struct {
	Colour string `query:"colour" oneof:"gray,red,yellow,green,blue"`
}
```

An empty parameter is `""`, which a service reads as "not filtered". A parameter the query doesn't
take, or a value outside its `oneof`, is a `400` on that parameter, naming the parameters that are
known. A query that takes none uses `cqrs.NoArgs`.

## Lookups

```go
cqrs.Lookup[cqrs.NoArgs, ItemCounts]{
	Name: "itemCounts", Permission: ItemsRead, DependsOn: []string{itemsChanged},
	Run: func(ctx context.Context, db page.Querier, _ *authn.Principal, _ cqrs.NoArgs) (ItemCounts, error) {
		return s.Counts(ctx, db)
	},
}
```

A lookup is also `GET /api/queries/<Name>`, with args but no page parameters, and answers its value
as it is: counts above a list, one record, a short fixed set of options.

## Commands

```go
cqrs.Command[AddLabel, Added]{
	Name: "addLabel", Permission: LabelsManage, Emits: []string{labelsChanged},
	Run: func(ctx context.Context, tx pgx.Tx, caller *authn.Principal, in AddLabel) (Added, error) {
		id, err := s.Add(ctx, tx, caller, *in.Name, *in.Colour)
		return Added{ID: id}, err
	},
}
```

A command is `POST /api/commands/<Name>` and answers a `cqrs.Answer[O]`: `{result, events}`, the
result and the events it emitted. Its input type implements `cqrs.Input`:

```go
type Input[I any] interface {
	Validate() (I, error)
}
```

`Validate` answers the clean input (trimmed, parsed) or a `problem.Validation` naming every mistake
at once, each violation's `Field` the input's JSON member, so a surface shows each message under
its field. Pointer members tell a missing member from an empty one. The body is decoded strictly: a
member the input doesn't have is a `400`. A rule about stored data belongs to the service, raised as
a problem (`problem.InvalidField("name", NameTaken)`), and it shows under the field the same way.

Names are camelCase and unique across the app's queries, lookups and commands; a command's name is
a verb. `cqrs.Mount(k, endpoints...)` serves them, usually from the feature module's `Mount`, and a
repeated name stops the app at start-up, naming it.

## Events

A command `Emits` the events its success means (`labelsChanged`); a query or lookup lists the events
it `DependsOn`. After a command succeeds, a screen refetches every query on it that depends on one
of the command's events, before it tells the person the change is done. One event per kind of change
is enough: a feature's list and its counts both depend on it.

## The command log and idempotency

`cqrs.Module{}` is the command log's table. An app turns it on once, in `cmd/server/modules.go`,
before any module that registers commands.

A command request may carry an `Idempotency-Key` header (`cqrs.IdempotencyKey`), a UUID. The key,
the caller and the answer are stored in the command log in the command's own transaction, so the key
is recorded only when the change commits. A request repeating the key answers the stored answer,
with the header `Idempotent-Replayed: true`, and runs nothing. A second request with the key while
the first is still running waits for it. The same key from another caller, or for another command,
is a `409`; a key that isn't a UUID is a `400`.

The surface runtime sends a fresh key per attempt: it keeps the key after a failure, so that
pressing the button again after a lost answer can't add the record twice, and makes a new one after
a success. Like Stripe's keys, a key is bound to its first request, not its body: when the network
fails after the server committed, and the person then edits the form and saves again, they get the
first attempt's stored result, not their edit. The edit itself is not saved; they can make it again
once the screen shows the first result.

## Stale writes

`cqrs` has no version check of its own. A command that edits a record from what the person last saw
takes the `version` it read in its input; the service selects the row `for update`, compares the
versions first, and answers `problem.StaleVersion()` (a `409`) when they differ, as a hand-written
handler does ([Errors](errors.md)).

## The contract

`cqrs.TypeScript(endpoints)` is the text of the front end's `contract.gen.ts`:

- an interface per Go type the endpoints name, from their `json` tags. In an input a pointer is an
  optional member (`title?: string | null`); elsewhere it is nullable (`at: string | null`). A
  struct used both in an input and elsewhere, differently, is written twice, the input's named
  `<Name>Input`. A type the contract can't describe (a map, an exported field without a `json` tag),
  or two types of one name, panics naming it: name every type after its feature (`LabelRow`).
- `Queries` and `Commands`, the types a binding is checked against: each query's kind, args, row and
  events, each command's input, result and events.
- `contract`, the object the runtime reads: each query's `kind` and `dependsOn`, each command's
  `emits`.

The text is the same whatever order the endpoints come in. An app's `cmd/server/contract_test.go`
compares it with the committed file, rewrites the file when it differs, and fails once so the change
is noticed, as the permissions test does with `permissions.gen.ts`:

```go
func TestTheFrontEndContractIsCurrent(t *testing.T) {
	want := cqrs.TypeScript(labels.Endpoints(labels.Service{}))
	if got, err := os.ReadFile(contractFile); err == nil && string(got) == want {
		return
	}
	if err := os.WriteFile(contractFile, []byte(want), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Fatal("frontend/src/contract.gen.ts was stale and is rewritten: run the test again and commit it")
}
```

Each feature adds its `Endpoints` to the list. The file is generated, so it is listed in the front
end's `.prettierignore` (beside `src/**/*.surface.gen.ts`) and never edited.

The generator reads each endpoint through `cqrs.Endpoint`'s `Describe()`, a `cqrs.Description`
(`Kind`, `Name`, `Permission`, `Events`, `In`, `Out`). Its `cqrs.Kind` is `cqrs.KindQuery`,
`cqrs.KindLookup` or `cqrs.KindCommand`.

## Testing

A feature's Go tests mount its endpoints over a fresh schema with `rouxtest`, the command log's
migration first, and call them as signed-in browsers:

```go
a := rouxtest.New(t, "labels")
a.Role("USER")
a.Migrate(cqrs.Module{}.Migrations()...)
a.Migrate(labels.Module{}.Migrations()...)
cqrs.Mount(a.Kit(), labels.Endpoints(labels.Service{Clock: a.Clock.Now})...)
a.Serve()
owner := a.SignedIn(a.Person("Olive Owner", "OWNER"))
owner.Post("/api/commands/addLabel", map[string]any{"name": "Urgent", "colour": "red"}).Want(t, 200, "add")
```

Test the permission (`403`), each rule of `Validate` (`400` naming its field), each of the service's
rules, and the query's filters, sorts and refusals. The recipe in the skill (`feature.md`) has the
whole set, built and run by `check-recipe.sh`.

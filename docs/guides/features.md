# A feature

A feature is a Go package in `internal/<feature>/` and a folder in `frontend/src/<feature>/`. On the
server: its tables, made by its own SQL migrations; a domain service that holds its rules and reads
and writes them with pgx; its typed queries and commands ([Queries and commands](cqrs.md)); and a
module that brings them into the app. In the browser: a surface drawn from roux's catalog, its
generated types and its binding ([Surfaces](surfaces.md)). There is no ORM and no feature-specific
React.

This guide builds one feature, `labels` (the tags an item can carry, a name and a colour), in the app
`roux-app`, from the table to the screen and their tests. It is the same feature the skill's recipe
builds, and `check-recipe.sh` builds and tests that recipe in a fresh copy of the template, so the
code here compiles and passes.

## The files

| File | What it is |
| --- | --- |
| `internal/labels/migrations/001_label.sql` | The table, the list's view, and the grants of the feature's permissions |
| `internal/labels/labels.go` | The permissions, the module, its migrations |
| `internal/labels/service.go` | The domain service: the rules, the SQL, the list |
| `internal/labels/cqrs.go` | The queries and commands: the feature's ports, and the command's input |
| `internal/labels/labels_test.go` | The endpoints over a real database, one test per rule ([Testing](testing.md)) |
| `cmd/server/modules.go` | The module in the list, its permissions in `permissions()` |
| `cmd/server/contract_test.go` | The front end's contract, generated from every feature's endpoints |
| `frontend/src/labels/labels.surface.json` | The screen, drawn from roux's catalog |
| `frontend/src/labels/labels.surface.gen.ts` | Generated: what the screen needs from outside |
| `frontend/src/labels/labels.binding.ts` | The screen's paths and events bound to the query and the command |
| `frontend/src/routes/_signedIn/labels.tsx` | The route: a guard and `<Surface>` |
| `frontend/src/labels/labels.binding.test.tsx` | The screen through its route, against MSW answers |

An app's first surface also needs the surfaces' setup: the A2UI SDK, two scripts, Vite's chunks,
the contract test and the app's binder, once ([Surfaces](surfaces.md#setting-up-an-app)).

## The table

```sql
-- The team's labels. Names are unique ignoring case.
create table label (
    id          uuid        primary key default gen_random_uuid(),
    name        text        not null check (char_length(name) between 1 and 40),
    colour      text        not null,
    version     bigint      not null default 0,
    created_at  timestamptz not null,
    created_by  uuid        not null references roux_identity (id),
    modified_at timestamptz not null,
    modified_by uuid        not null references roux_identity (id)
);

create unique index label_name_key on label (lower(name));

-- The list: one row per label with every column it shows, sorts by or searches.
create view label_list as
select l.id, l.name, l.colour, l.version,
       u.display_name as created_by_name
  from label l
  join roux_user u on u.id = l.created_by;

-- Every member may see the labels; only an owner may add them.
insert into roux_role_permission (role_id, permission)
select r.id, 'labels.read' from roux_role r where r.name in ('USER', 'OWNER')
on conflict do nothing;

insert into roux_role_permission (role_id, permission)
select r.id, 'labels.manage' from roux_role r where r.name = 'OWNER'
on conflict do nothing;
```

- **A migration is a `.sql` file in the feature's `migrations/` folder**, run in name order
  (`001_label.sql`, then `002_...`), each in its own transaction, once. roux records each file it
  ran with a checksum (in `schema_history`), and **an edited file that has run stops startup**, so
  never edit one that has run anywhere. A later change is a new file (`002_label_order.sql` with
  `alter table label add column ...`).
- **`id uuid primary key default gen_random_uuid()`.** The database makes the id.
- **`version bigint not null default 0`**, raised by every update, so an edit made from an old copy
  can be refused ([Errors](errors.md#refuse-a-stale-save)).
- **Who and when:** `created_at`, `created_by`, `modified_at`, `modified_by`, set by the service
  from its clock and the caller. A reference to a person is `references roux_identity (id)` (a
  person who signs in) or `references roux_user (id)` (a member of the team; see [Users](users.md)).
- **Text is `text` with a `check` on its length**, the same number as the Go constant (`MaxName`),
  so the database refuses what the command would.
- **Unique ignoring case** is a unique index on `lower(...)`. The service checks first, so the
  person sees a message under the field; the index guards the race the check cannot see (two saves
  at once), which roux answers `409`.
- **The list is a view**: one row per label with every column the screen shows, sorts by or
  searches, joined values (`created_by_name`) among them ([Tables and paging](tables-and-paging.md)).
- **The feature's permissions are granted in its own migration**, by role name, after the roles
  exist. roux creates `OWNER`; the app's own roles (`USER`) are made by `cmd/server/migrations/`,
  which is why the module's migration runs `After` `app-roles` ([Roles and permissions](roles.md)).

## The module

```go
// Package labels is the team's labels: the tags an item can carry. Everyone may see them; only
// an owner may add them.
package labels

import (
	"context"
	"embed"
	"time"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/cqrs"
	"github.com/jwcarman/roux/pgdb"
)

// The labels' permissions (migrations/001_label.sql grants them).
const (
	LabelsRead   = "labels.read"
	LabelsManage = "labels.manage"
)

// Permissions is every permission labels checks, for the app's list of them.
var Permissions = []string{LabelsRead, LabelsManage}

//go:embed migrations/*.sql
var migrations embed.FS

// Module is the labels feature: its table and its queries and commands.
type Module struct {
	// Clock is the time changes are stamped with; time.Now when nil.
	Clock func() time.Time
}

func (Module) Name() string { return "labels" }

func (Module) Migrations() []pgdb.Migration {
	return []pgdb.Migration{{Name: "labels", FS: migrations, Dir: "migrations", After: []string{"roux-users", "app-roles"}}}
}

func (m Module) Mount(_ context.Context, k *app.Kit) error {
	now := m.Clock
	if now == nil {
		now = time.Now
	}
	cqrs.Mount(k, Endpoints(Service{Clock: now})...)
	return nil
}
```

- **The permissions are constants** in the package that checks them, and `Permissions` lists them
  for the app's list ([Roles and permissions](roles.md)).
- **`//go:embed migrations/*.sql`** puts the SQL in the binary. `Migrations()` names them: `Name`
  is unique in the app (lowercase words joined by `-`), and `After` names the migrations that must
  run first.
- **`Mount`** builds the service and serves the feature's endpoints with `cqrs.Mount`. A module with
  work to do after every module is mounted also has `Start(ctx, k) error` (making a first record,
  say).
- **The clock is a field**, `time.Now` when nil, so a test sets the time.

## The domain service

```go
package labels

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/problem"
)

// MaxName is the longest name, in characters (migrations/001_label.sql checks it too).
const MaxName = 40

// Colours are the palettes a label may be shown in (Chakra UI's names).
var Colours = []string{"gray", "red", "yellow", "green", "blue"}

// NameTaken is what a clash of names says, under the name field.
const NameTaken = "Another label has this name"

// Service is the labels' operations. It takes the database it works in, so a command's
// transaction (and the command log in it) is the one it writes in.
type Service struct {
	Clock func() time.Time
}

// Sort is how the list may be sorted: the sortBy values a client sends.
type Sort string

const (
	ByName      Sort = "NAME"
	ByColour    Sort = "COLOUR"
	ByCreatedBy Sort = "CREATED_BY"
)

var list = page.New(page.ListConfig[Sort, LabelRow]{
	From: "label_list",
	Sorts: map[Sort][]page.Term{
		ByName:      {page.By("lower(name)")},
		ByColour:    {page.By("colour"), page.By("lower(name)")},
		ByCreatedBy: {page.By("lower(created_by_name)")},
	},
	DefaultSort:     ByName,
	DefaultPageSize: 25,
	Search:          []page.Field{page.Contains("name"), page.Contains("created_by_name")},
})

// LabelRow is a label as the list shows it: each db tag is a column of the view.
type LabelRow struct {
	ID            uuid.UUID `json:"id" db:"id"`
	Name          string    `json:"name" db:"name"`
	Colour        string    `json:"colour" db:"colour"`
	CreatedByName string    `json:"createdByName" db:"created_by_name"`
	Version       int64     `json:"version" db:"version"`
}

// Page is a page of labels, narrowed by a search and, unless it is empty, a colour.
func (Service) Page(ctx context.Context, db page.Querier, req page.Request, search, colour string) (page.Page[LabelRow], error) {
	return list.Page(ctx, db, req, search, page.WhereIf(colour != "", "colour = ?", colour))
}

// Add adds a label. Its name is the only one ignoring case: another is refused under the name.
func (s Service) Add(ctx context.Context, tx pgx.Tx, caller *authn.Principal, name, colour string) (uuid.UUID, error) {
	var taken bool
	if err := tx.QueryRow(ctx, `select exists (select 1 from label where lower(name) = lower($1))`, name).
		Scan(&taken); err != nil {
		return uuid.Nil, err
	}
	if taken {
		return uuid.Nil, problem.InvalidField("name", NameTaken)
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, `
		insert into label (name, colour, created_at, created_by, modified_at, modified_by)
		values ($1, $2, $3, $4, $3, $4) returning id`,
		name, colour, s.Clock(), caller.IdentityID).Scan(&id)
	return id, err
}
```

The service is where the feature's rules live, whatever drives it: the queries and commands today,
an agent's tool or a scheduled job later ([Queries and commands](cqrs.md#ports-and-adapters)).

- **It takes the database it works in**: a `page.Querier` (the pool, or a transaction) for a read,
  the command's `pgx.Tx` for a write, so the change commits with the command log.
- **SQL text is a constant; values are always arguments** (`$1`, `$2`). Never build SQL from what a
  request sent.
- **A rule about the data is the service's**, raised as a `*problem.Problem` returned as the error
  ([Errors](errors.md)): a name another label has is `problem.InvalidField("name", NameTaken)`, a
  `400` shown under the name field. A message of the feature's own is a constant, so a test can
  name it. Anything else returned is a `500` that says nothing about why and logs the cause.
- **The list is a `page.New` paginator** over the view: its sorts, its default page size and the
  fields a search looks in ([Tables and paging](tables-and-paging.md#the-server)). Its row,
  `LabelRow`, has a `db` tag naming each column and a `json` tag naming each member.
- **Name every type an endpoint names after the feature** (`LabelRow`, `AddLabel`): the browser's
  contract is one namespace, and two types of one name stop it.
- **Time comes from the service's clock**, today from the organization's zone
  ([Dates and time](dates-and-time.md)). A change worth a history is recorded with
  `activity.Append` in the same transaction ([The activity log](activity-log.md)).

## The queries and commands

```go
package labels

import (
	"context"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/cqrs"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/problem"
)

// labelsChanged is the event after which a screen showing the labels refetches them.
const labelsChanged = "labelsChanged"

// LabelsArgs are the labels query's filters; one left empty is not filtered on.
type LabelsArgs struct {
	Colour string `query:"colour" oneof:"gray,red,yellow,green,blue"` // Colours
}

// AddLabel is the addLabel command's input as it arrives; pointers tell a missing member from an
// empty one.
type AddLabel struct {
	Name   *string `json:"name"`
	Colour *string `json:"colour"`
}

// Validate is the cqrs.Input rule: a name of 1 to MaxName characters and one of Colours. It
// answers every mistake at once, each under its member.
func (a AddLabel) Validate() (AddLabel, error) {
	var v []problem.Violation
	name := strings.TrimSpace(deref(a.Name))
	switch n := utf8.RuneCountInString(name); {
	case n == 0:
		v = append(v, problem.Violation{Field: "name", Message: problem.MustNotBeBlank})
	case n > MaxName:
		v = append(v, problem.Violation{Field: "name", Message: problem.MustBeBetween(1, MaxName)})
	}
	colour := deref(a.Colour)
	if !slices.Contains(Colours, colour) {
		v = append(v, problem.Violation{Field: "colour", Message: problem.MustBeOneOf(Colours...)})
	}
	if len(v) > 0 {
		return AddLabel{}, problem.Validation(v...)
	}
	return AddLabel{Name: &name, Colour: &colour}, nil
}

// Added is what addLabel answers.
type Added struct {
	ID uuid.UUID `json:"id"`
}

// Endpoints are the labels' queries and commands: the feature's ports. Each is thin; the work is
// the Service's.
func Endpoints(s Service) []cqrs.Endpoint {
	return []cqrs.Endpoint{
		cqrs.Query[LabelsArgs, LabelRow]{
			Name: "labels", Permission: LabelsRead, DependsOn: []string{labelsChanged}, Paging: list.Config(),
			Run: func(ctx context.Context, db page.Querier, _ *authn.Principal, req page.Request, search string, args LabelsArgs) (page.Page[LabelRow], error) {
				return s.Page(ctx, db, req, search, args.Colour)
			},
		},
		cqrs.Command[AddLabel, Added]{
			Name: "addLabel", Permission: LabelsManage, Emits: []string{labelsChanged},
			Run: func(ctx context.Context, tx pgx.Tx, caller *authn.Principal, in AddLabel) (Added, error) {
				id, err := s.Add(ctx, tx, caller, *in.Name, *in.Colour)
				return Added{ID: id}, err
			},
		},
	}
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
```

- **`labels` is a query**: `GET /api/queries/labels` with roux's page parameters, `search`, and the
  args' parameters (`colour`), answering a page of `LabelRow`. A colour outside the `oneof`, or a
  parameter it doesn't take, is a `400` on that parameter before `Run`.
- **`addLabel` is a command**: `POST /api/commands/addLabel`, answering `{result, events}`. Its
  input is a struct of pointers, so a missing member is told from an empty one.
- **`Validate` checks every member and answers every mistake at once**, as `problem.Validation`, a
  `400` whose `errors` name each member; the surface shows each under its field. The words are
  roux's (`problem.MustNotBeBlank`, `problem.MustBeBetween(1, MaxName)`, `problem.MustBeOneOf(...)`),
  the same the screen's checks show. Trim text before checking it, and count characters with
  `utf8.RuneCountInString`, never `len` (bytes).
- **`Run` is thin**: its input is already valid, so it calls the service. The `pgx.Tx` it gets is
  the command's transaction, which the command log shares.
- **Events tie them together**: `addLabel` emits `labelsChanged`, and `labels` depends on it, so a
  screen showing the list refetches it after an add.
- Each endpoint has its permission; roux checks the sign-in, the permission and the CSRF token
  before it runs: `401` signed out, `403` without the permission.

## Turning it on

In `cmd/server/modules.go`, the command log (`cqrs.Module{}`, once, before the first feature with
commands) and the module join the list, and the feature's permissions join the app's:

```go
mods = append(mods, email, members, cqrs.Module{}, labels.Module{})
```

```go
return slices.Concat(app.RouxPermissions(), labels.Permissions)
```

The front end's contract lists every feature's endpoints, in `cmd/server/contract_test.go`
([Queries and commands](cqrs.md#the-contract)):

```go
want := cqrs.TypeScript(labels.Endpoints(labels.Service{}))
```

The next `go test ./cmd/server` rewrites `frontend/src/permissions.gen.ts` (`LABELS_READ`,
`LABELS_MANAGE`) and `frontend/src/contract.gen.ts` (the `labels` query, the `addLabel` command and
their types) and fails once, so the change is noticed and committed. It also fails if `OWNER` lacks
a permission or a migration grants one nobody declares.

## The server's test

```go
package labels_test

import (
	"slices"
	"testing"

	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/cqrs"
	"github.com/jwcarman/roux/rouxtest"

	"roux-app/internal/labels"
)

// setup is the labels' endpoints over a fresh schema, with Olive (OWNER) and Ada (USER) signed in.
func setup(t *testing.T) (owner, user *authntest.Browser) {
	t.Helper()
	a := rouxtest.New(t, "labels")
	a.Role("USER") // the app's own role, before labels grants to it
	a.Migrate(cqrs.Module{}.Migrations()...)
	a.Migrate(labels.Module{}.Migrations()...)
	cqrs.Mount(a.Kit(), labels.Endpoints(labels.Service{Clock: a.Clock.Now})...)
	a.Serve()
	return a.SignedIn(a.Person("Olive Owner", "OWNER")), a.SignedIn(a.Person("Ada Lovelace", "USER"))
}

// names is the names on the labels query's page, as b sees it.
func names(t *testing.T, b *authntest.Browser, query string) []string {
	t.Helper()
	var pg struct {
		Data []labels.LabelRow `json:"data"`
	}
	b.Get("/api/queries/labels"+query).Want(t, 200, "labels"+query).Decode(t, &pg)
	out := []string{}
	for _, r := range pg.Data {
		out = append(out, r.Name)
	}
	return out
}

func add(name, colour string) map[string]any { return map[string]any{"name": name, "colour": colour} }

func TestAnOwnerAddsALabelThatEveryoneSees(t *testing.T) {
	owner, user := setup(t)
	got := owner.Post("/api/commands/addLabel", add(" Urgent ", "red")).Want(t, 200, "add").JSON(t)
	if events := got["events"].([]any); len(events) != 1 || events[0] != "labelsChanged" {
		t.Fatalf("answer %v", got)
	}
	var pg struct {
		Data []labels.LabelRow `json:"data"`
	}
	user.Get("/api/queries/labels").Want(t, 200, "list").Decode(t, &pg)
	if len(pg.Data) != 1 || pg.Data[0].Name != "Urgent" || pg.Data[0].CreatedByName != "Olive Owner" {
		t.Fatalf("list %+v", pg.Data)
	}
}

func TestOnlyAnOwnerAddsLabels(t *testing.T) {
	_, user := setup(t)
	user.Post("/api/commands/addLabel", add("Waiting", "yellow")).Want(t, 403, "a USER")
}

func TestALabelNeedsANameAndAColourItKnows(t *testing.T) {
	owner, _ := setup(t)
	got := owner.Post("/api/commands/addLabel", add(" ", "mauve")).Want(t, 400, "bad").JSON(t)
	if errs, _ := got["errors"].([]any); len(errs) != 2 {
		t.Fatalf("errors %v", got)
	}
}

func TestTwoLabelsMayNotShareANameIgnoringCase(t *testing.T) {
	owner, _ := setup(t)
	owner.Post("/api/commands/addLabel", add("Waiting", "yellow")).Want(t, 200, "first")
	got := owner.Post("/api/commands/addLabel", add("WAITING", "green")).Want(t, 400, "second").JSON(t)
	if errs := got["errors"].([]any); errs[0].(map[string]any)["message"] != labels.NameTaken {
		t.Fatalf("got %v", got)
	}
}

func TestTheListSearchesFiltersSortsAndRefusesWhatItDoesNotKnow(t *testing.T) {
	owner, user := setup(t)
	owner.Post("/api/commands/addLabel", add("Urgent", "red")).Want(t, 200, "first")
	owner.Post("/api/commands/addLabel", add("Waiting", "yellow")).Want(t, 200, "second")
	for query, want := range map[string][]string{
		"":                                 {"Urgent", "Waiting"},
		"?colour=red":                      {"Urgent"},
		"?search=wait":                     {"Waiting"},
		"?sortBy=NAME&sortDirection=DESC":  {"Waiting", "Urgent"},
		"?colour=&search=&pageIndex=0":     {"Urgent", "Waiting"},
		"?sortBy=COLOUR&sortDirection=ASC": {"Urgent", "Waiting"},
	} {
		if got := names(t, user, query); !slices.Equal(got, want) {
			t.Errorf("%q: %v", query, got)
		}
	}
	user.Get("/api/queries/labels?colour=mauve").Want(t, 400, "an unknown colour")
	user.Get("/api/queries/labels?sortBy=NOPE").Want(t, 400, "an unknown sort")
	user.Get("/api/queries/labels?shade=dark").Want(t, 400, "an unknown parameter")
}
```

`rouxtest.New` is the feature over a fresh schema with roux's tables; `a.Role("USER")` makes the
app's role before the feature's migration grants to it; `Person` is a member of the team in a role,
and `SignedIn` a browser signed in as them, with the CSRF token. One test per behaviour: a success,
the permission, the input's rules, the service's rules, and the list's filters, sorts and refusals.
[Testing](testing.md) says more.

## The screen

The surface, drawn only from roux's catalog ([The A2UI catalog](a2ui-catalog.md)):

```json
{
  "id": "labels",
  "components": [
    { "id": "root", "component": "Column", "children": ["title", "filters", "table", "addCard"] },
    { "id": "title", "component": "Heading", "text": "Labels", "size": "xl" },
    { "id": "filters", "component": "Card", "children": ["filterForm"] },
    { "id": "filterForm", "component": "Form", "children": ["search", "shown"] },
    { "id": "search", "component": "InputField", "label": "Search", "value": { "@path": "/labelsArgs/search" } },
    {
      "id": "shown",
      "component": "SelectField",
      "label": "Show",
      "value": { "@path": "/labelsArgs/colour" },
      "options": [
        { "value": "", "label": "Every colour" },
        { "value": "gray", "label": "Gray" },
        { "value": "red", "label": "Red" },
        { "value": "yellow", "label": "Yellow" },
        { "value": "green", "label": "Green" },
        { "value": "blue", "label": "Blue" }
      ]
    },
    {
      "id": "table",
      "component": "DataTable",
      "rows": { "@path": "/labels" },
      "pageIndex": { "@path": "/labelsArgs/pageIndex" },
      "sortBy": { "@path": "/labelsArgs/sortBy" },
      "sortDirection": { "@path": "/labelsArgs/sortDirection" },
      "emptyText": "No labels yet",
      "columns": [
        { "header": "Name", "field": "name", "sort": "NAME" },
        { "header": "Colour", "field": "colour", "format": "badge", "sort": "COLOUR" },
        { "header": "Added by", "field": "createdByName", "sort": "CREATED_BY" }
      ]
    },
    { "id": "addCard", "component": "Card", "title": "Add a label", "children": ["addForm"] },
    { "id": "addForm", "component": "Form", "children": ["draftName", "draftColour", "add"] },
    {
      "id": "draftName",
      "component": "InputField",
      "label": "Name",
      "required": true,
      "value": { "@path": "/draft/name" },
      "serverError": { "@path": "/errors/name" },
      "@checks": [
        {
          "condition": { "@call": "required", "args": { "value": { "@path": "/draft/name" } } },
          "message": "Must not be blank"
        }
      ]
    },
    {
      "id": "draftColour",
      "component": "SelectField",
      "label": "Colour",
      "placeholder": "Choose a colour",
      "required": true,
      "value": { "@path": "/draft/colour" },
      "serverError": { "@path": "/errors/colour" },
      "options": [
        { "value": "gray", "label": "Gray" },
        { "value": "red", "label": "Red" },
        { "value": "yellow", "label": "Yellow" },
        { "value": "green", "label": "Green" },
        { "value": "blue", "label": "Blue" }
      ]
    },
    {
      "id": "add",
      "component": "Button",
      "label": "Add label",
      "action": {
        "event": {
          "name": "addLabel",
          "context": { "name": { "@path": "/draft/name" }, "colour": { "@path": "/draft/colour" } }
        }
      }
    }
  ]
}
```

Its top-level paths are its data: `/labels` (the query's page), `/labelsArgs` (the list's search,
colour, page and sort), `/draft` (the add form), `/errors` (the server's word on each field). A
column's `sort` is one of the service's `Sort` values; an option's `value` is spelled as `Colours`
spells it; the name's check says `Must not be blank`, as the server does.

`npm run surfaces` writes `labels.surface.gen.ts` from it: `LabelsSurfaceData` (what each path
holds) and `LabelsSurfaceEvents` (what `addLabel` carries). Run it after every change to the JSON;
CI's `npm run surfaces:check` fails on a stale one.

The binding fills each path and runs each event:

```ts
// The labels surface (labels.surface.json) bound to the labels query and the addLabel command.
import { bind } from "../surfaces";
import type { LabelsSurfaceData, LabelsSurfaceEvents } from "./labels.surface.gen";

/** The list's search, colour, page and sort to start with: every label, by name. */
const FIRST_ARGS = { search: "", colour: "", pageIndex: 0, sortBy: "NAME", sortDirection: "ASC" };

/** The list from the server; its filters and the add form kept on screen. */
export const labelsBinding = bind<LabelsSurfaceData, LabelsSurfaceEvents>(({ d, query, local, command }) => ({
  data: {
    labels: query("labels", {
      search: d.labelsArgs.search,
      colour: d.labelsArgs.colour,
      pageIndex: d.labelsArgs.pageIndex,
      sortBy: d.labelsArgs.sortBy,
      sortDirection: d.labelsArgs.sortDirection,
    }),
    labelsArgs: local(FIRST_ARGS),
    draft: local({ name: "", colour: "" }),
    errors: local({ name: "", colour: "" }),
  },
  events: {
    addLabel: command("addLabel", (label) => label, {
      errors: d.errors,
      onSuccess: [{ reset: d.draft }, { toast: "Label added" }],
    }),
  },
}));
```

It is checked by the compiler against the generated types and the contract: a path or an event left
out, a field the query doesn't answer, an input member missing, each fails the build at its line. It
is a module-level constant: a `bind()` in a component would restart the surface on every render.

The route guards it and renders it:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@jwcarman/roux-web/session";
import { Surface } from "@jwcarman/roux-web/surface";
import { labelsBinding } from "../../labels/labels.binding";
import labelsSurface from "../../labels/labels.surface.json";
import { LABELS_READ } from "../../permissions.gen";

export const Route = createFileRoute("/_signedIn/labels")({
  beforeLoad: ({ context }) => requirePermission(context.me, LABELS_READ),
  component: () => <Surface surface={labelsSurface} binding={labelsBinding} />,
});
```

and one more entry in `frontend/src/shell/nav.ts` puts it in the sidebar
([The shell](shell.md)).

## The screen's test

```tsx
// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { invalidFields, pageOf, server } from "@jwcarman/roux-web/testing";
import type { LabelRow } from "../contract.gen";
import { LABELS_MANAGE, LABELS_READ } from "../permissions.gen";
import { renderRoute } from "../testing/route";

const URGENT: LabelRow = { id: "l-1", name: "Urgent", colour: "red", createdByName: "Olive Owner", version: 0 };

/** The labels on the server; each labels request's query string and each addLabel body, in order. */
let rows: LabelRow[];
let asked: URLSearchParams[];
let added: unknown[];

beforeEach(() => {
  rows = [URGENT];
  asked = [];
  added = [];
  document.cookie = "XSRF-TOKEN=token";
  server.use(
    http.get("/api/queries/labels", ({ request }) => {
      asked.push(new URL(request.url).searchParams);
      return HttpResponse.json(pageOf(rows, { pageIndex: 0, pageSize: 25 }));
    }),
    http.post("/api/commands/addLabel", async ({ request }) => {
      const body = (await request.json()) as { name: string; colour: string };
      added.push(body);
      if (body.name === "Taken") return invalidFields({ name: "Another label has this name" });
      rows = [...rows, { ...URGENT, id: "l-2", name: body.name, colour: body.colour }];
      return HttpResponse.json({ result: { id: "l-2" }, events: ["labelsChanged"] });
    }),
  );
});
afterEach(() => {
  act(() => toaster.remove());
});

const open = () => renderRoute("/labels", { permissions: [LABELS_READ, LABELS_MANAGE] });
const latest = () => Object.fromEntries(asked[asked.length - 1]);

describe("the labels surface", () => {
  it("lists the labels: name, colour and who added it", async () => {
    open();
    const table = await screen.findByRole("table", {}, { timeout: 5000 });
    expect(within(table).getByText("Urgent")).toBeInTheDocument();
    expect(within(table).getByText("Olive Owner")).toBeInTheDocument();
    expect(latest()).toEqual({ search: "", colour: "", pageIndex: "0", sortBy: "NAME", sortDirection: "ASC" });
  });

  it("asks for one colour's labels when it is chosen", async () => {
    open();
    await screen.findByRole("table", {}, { timeout: 5000 });
    await userEvent.selectOptions(screen.getByLabelText("Show"), "Yellow");
    await waitFor(() => expect(latest()).toMatchObject({ colour: "yellow", pageIndex: "0" }));
  });

  it("adds a label, then the list refreshes and the draft clears", async () => {
    open();
    await screen.findByRole("table", {}, { timeout: 5000 });
    await userEvent.type(screen.getByLabelText(/^Name/), "Waiting");
    await userEvent.selectOptions(screen.getByLabelText(/^Colour/), "Yellow");
    await userEvent.click(screen.getByRole("button", { name: "Add label" }));

    expect(await screen.findByText("Waiting")).toBeInTheDocument();
    expect(added).toEqual([{ name: "Waiting", colour: "yellow" }]);
    expect(await screen.findByText("Label added")).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>(/^Name/).value).toBe("");
  });

  it("shows the server's word on a field under that field", async () => {
    open();
    await screen.findByRole("table", {}, { timeout: 5000 });
    await userEvent.type(screen.getByLabelText(/^Name/), "Taken");
    await userEvent.selectOptions(screen.getByLabelText(/^Colour/), "Red");
    await userEvent.click(screen.getByRole("button", { name: "Add label" }));
    expect(await screen.findByText("Another label has this name")).toBeInTheDocument();
  });

  it("sends someone without the permission home", async () => {
    const { router } = renderRoute("/labels", { permissions: [] });
    await screen.findByRole("heading", { name: /^Welcome/ });
    expect(router.state.location.pathname).toBe("/");
  });
});
```

The screen is tested through its route, with MSW answering in the server's shapes: the list and
what each filter asks for, an add (the command's body, the refreshed list, the toast, the cleared
draft), a server field error under its field, and the guard. The front end's coverage gate is 100%,
and the binding's `build` runs only when a test clicks the button.

## Endpoints that are not queries or commands

A few endpoints are neither a read a screen shows nor a change it makes: a file download, a webhook
from another service, an endpoint for a client that signs in by a header. Those are handlers, as
roux's own endpoints are:

```go
k.Handle("GET /api/labels/export", LabelsRead, func(w http.ResponseWriter, r *http.Request) error {
	// ...
	return api.JSON(w, http.StatusOK, out)
})
```

- **`k.Handle(pattern, permission, fn)`** checks the CSRF token, a sign-in and the permission
  before `fn` runs. A route for anyone signed in is `k.HandleSignedIn`, and one for anybody (signed
  out too) `k.HandlePublic`; an empty permission panics at startup, and one no role holds stops it,
  naming the route. Never mount an app route with `k.Mux.Handle`: it would be open, and startup
  warns that it is.
- **The pattern is Go's** (`net/http`): a method, a space, a path, `{id}` read with
  `r.PathValue("id")`.
- **A handler returns an error** and writes nothing when it does: roux answers a
  `*problem.Problem` as itself and anything else as a `500`. **`api.Decode`** reads one JSON object,
  refusing a member it doesn't know with a `400`; **`api.JSON(w, status, v)`** answers.

## Check it

- `make check` runs gofmt, `go vet`, golangci-lint and every test. The database tests start
  PostgreSQL in Docker, or use `TEST_DATABASE_URL`.
- A migration that fails stops every test that runs it, naming the file and PostgreSQL's error.
- `go test ./cmd/server` checks the permissions (the front end's list, and every grant) and the
  contract.
- In `frontend/`: `npm run surfaces:check`, `npm run coverage`, `npm run build` (where a binding
  that misses something fails) and `npm run lint`.

## Don't

- Don't write a feature's screen, form or list in React; draw it as a surface. What the catalog
  can't draw is a new primitive ([Adding a primitive](adding-a-primitive.md)).
- Don't put a rule in a command's `Run`; put it in the service, where every adapter keeps it.
- Don't begin a transaction in `Run` or the service a command calls; write in the command's `pgx.Tx`.
- Don't build SQL from what a request sent; pass values as arguments.
- Don't edit a migration that has run; add one.
- Don't edit a generated file (`permissions.gen.ts`, `contract.gen.ts`, `*.surface.gen.ts`).
- Don't answer a refusal by writing to the response; return a `*problem.Problem`.
- Don't catch a unique violation to turn the race into a field error: no test can make two saves
  race, and roux already answers it `409`.

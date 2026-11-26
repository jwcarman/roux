# Add a feature: the recipe

A new resource end to end: the table, the domain service, the feature's queries and commands
(`cqrs`), its tests, then its screen: a surface drawn from roux's catalog, its generated types, its
binding, the route and the nav entry. **No feature-specific React.** The example is `labels` (a name
and a colour) in an app whose Go module is `roux-app`; replace `label`/`Label`/`labels` with the
feature's names throughout, and `roux-app` with the module line of the app's `go.mod`.

## First: find the nearest feature

In a grown app, open the existing feature most like the new one (`internal/<feature>/` and
`frontend/src/<feature>/`) and copy its files' shape. Use this recipe for the order, the exact roux
names and the checks. In a new app there is none: follow it as written, step 0 included.

## Rules

- A feature is one Go package, `internal/<feature>/`, with its SQL in `migrations/` beside it. SQL
  is constant text; values are always `$1` arguments (SQL built from what a request sent is an
  injection).
- **Queries and commands are the feature's ports** (`cqrs.md`). `cqrs.Mount` serves them over HTTP;
  the surface and its binding drive them from the browser. A command's `Run` is thin: its input is
  already validated (`Validate`), so it calls the domain service, where the rules live
  (`Service.Add`). `Run` gets the `pgx.Tx` because roux is Postgres-only and the command log must
  commit with the change.
- **The screen is a surface** (`surfaces.md`): `<id>.surface.json` drawn only from roux's catalog,
  `<id>.surface.gen.ts` generated from it, `<id>.binding.ts` written. A thing the catalog can't
  draw is a new primitive (`surfaces.md`, "Adding a primitive"), never a hand-written screen.
- Refusals are `*problem.Problem` values returned as the error (`problem.Validation`,
  `problem.InvalidField`, `problem.NotFound`, `problem.Conflict`). Never write an error response:
  roux answers a problem as itself and anything else as a `500`. A field problem shows under its
  field on the surface. Messages are shown verbatim: write them for people.
- Every endpoint has a permission, never a role: roles are data the owner can change. Permissions
  are granted in the feature's migration, by role name.
- Never edit a migration that has run (roux keeps a checksum); add a new one. Never hand-edit a
  generated file (`permissions.gen.ts`, `contract.gen.ts`, `*.surface.gen.ts`, `routeTree.gen.ts`):
  tests, the build and `npm run surfaces` rewrite them.
- Time comes from the module's clock (`time.Now` when nil), today from the organization's zone
  (`dates.md`), so tests set the time.

## Steps

### 0. Once per app: the surfaces' setup

Skip this step when `frontend/src/surfaces.ts` exists.

The A2UI SDK (`@a2ui/react`, `@a2ui/web_core`) and the Zod 3 it is built on, under the alias `zod3`,
beside roux-web (its optional peers), and the scripts that generate and check the surfaces' types:

<!-- run: frontend -->
```bash
npm install --no-audit --no-fund @a2ui/react@^0.16.1 @a2ui/web_core@^0.16.1 zod3@npm:zod@^3.25.76
npm pkg set "scripts.surfaces=roux-surface-types src/**/*.surface.json" \
  "scripts.surfaces:check=roux-surface-types --check src/**/*.surface.json"
```

The SDK is large. In `frontend/vite.config.ts`, replace the line `build: { outDir: "dist",
emptyOutDir: true },` so it loads in chunks of its own, which the browser caches apart from the
app's code (without it Vite puts it in the first surface's chunk and warns that the chunk is over
500 kB):

<!-- fragment: vite-build -->
```ts
build: {
  outDir: "dist",
  emptyOutDir: true,
  // A surface's runtime (the A2UI SDK and the Zod 3 its schemas are built on) is large: it loads in
  // chunks of its own, beside the page's.
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

The contract is generated, not formatted: one more line at the end of `frontend/.prettierignore`:

<!-- fragment: prettierignore -->
```text
src/contract.gen.ts
```

The app's binder, made once from the generated contract, `frontend/src/surfaces.ts`:

<!-- file: frontend/src/surfaces.ts -->
```ts
// The app's surface binder, made once from the generated contract: each surface's binding uses `bind`.
import { surfaces } from "@jwcarman/roux-web/surface";
import { contract, type Commands, type Queries } from "./contract.gen";

export const { bind } = surfaces<Queries, Commands>(contract);
```

The contract test, `cmd/server/contract_test.go`. It writes `frontend/src/contract.gen.ts` from the
endpoints and fails once when that changed, as the permissions test does; each feature adds its
`Endpoints` to the list:

<!-- file: cmd/server/contract_test.go -->
```go
package main

import (
	"os"
	"testing"

	"github.com/jwcarman/roux/cqrs"

	"roux-app/internal/labels"
)

// contractFile is the front end's copy of the server's queries and commands.
const contractFile = "../../frontend/src/contract.gen.ts"

// The front end's contract is the server's queries and commands: a change to one is rewritten into
// frontend/src/contract.gen.ts, and this test fails once so the change is noticed and committed.
// Each feature adds its endpoints: slices.Concat(labels.Endpoints(labels.Service{}), ...).
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

`cqrs.Module{}` (the command log's table) is turned on in step 6, before the first feature with
commands.

### 1. The table: `internal/labels/migrations/001_label.sql`

<!-- file: internal/labels/migrations/001_label.sql -->
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

- Files run in name order, each once, in its own transaction. A later change is a new file
  (`002_label_order.sql`).
- The `check` repeats the Go limit (`MaxName`); the unique index guards the race the service's own
  check cannot see (roux answers it `409`).
- The grants are by role **name**, never id. Grant to `OWNER` every permission; to `USER` (the app's
  role) what members may do.

### 2. The module: `internal/labels/labels.go`

<!-- file: internal/labels/labels.go -->
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

- `After` must name `app-roles` (the migration that creates `USER`): without it the grant to `USER`
  may run first, finds no role, and grants nothing, silently.

### 3. The domain service: `internal/labels/service.go`

The feature's rules, whatever drives them: the `cqrs` endpoints today, an agent's tool or a job
later.

<!-- file: internal/labels/service.go -->
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

- A rule about the data (a unique name, a state an item must be in) is the service's, raised as a
  `problem`; a rule about the input alone is `Validate`'s (step 4).
- The list is a `page.New` paginator over the view; `list.Config()` is its paging rules for the
  query. Sorts, search and views: `lists.md`.
- Name the row and every type an endpoint names after the feature (`LabelRow`, `AddLabel`): the
  contract is one namespace, and two types of one name panic at start-up.

### 4. The queries and commands: `internal/labels/cqrs.go`

<!-- file: internal/labels/cqrs.go -->
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

- A query is `GET /api/queries/<Name>` (roux's page parameters plus the args' `query` tags); a
  command is `POST /api/commands/<Name>` answering `{result, events}`. Names are camelCase, unique
  in the app; a command's name is a verb (`addLabel`).
- `Validate` returns the clean input (trimmed); `Run` gets that one. Its words are roux's
  (`problem.MustNotBeBlank`, `problem.MustBeBetween`, `problem.MustBeOneOf`), each violation's
  `Field` the input's JSON member. Trim before checking; count characters with
  `utf8.RuneCountInString`, never `len`.
- An arg's `oneof` is the list of values, spelled as `Colours` spells them: a value outside it is a
  `400` on that parameter, before `Run`.
- `DependsOn` and `Emits` name events: after a command, the screens refetch the queries that depend
  on what it emits.

### 5. The Go test: `internal/labels/labels_test.go`

<!-- file: internal/labels/labels_test.go -->
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

- `rouxtest.New(t, "labels")` is a fresh schema with roux's tables. `a.Role("USER")` creates the
  app's role before the feature's migration grants to it; `cqrs.Module{}`'s migration makes the
  command log.
- `a.Person(name, role)` makes a member; `a.SignedIn(id)` is a browser signed in as them, with the
  CSRF token. `Want(t, status, what)` fails with the body when the status differs; `.JSON(t)` and
  `.Decode(t, &v)` read the answer.
- One test per behaviour: a success, the permission (`403`), the input's rules (`400`), the
  service's rules, and the query's filters, sorts and refusals. The frontend's 100% gate forces its
  paths; nothing forces the Go ones, so write each.
- The tests need PostgreSQL: `TEST_DATABASE_URL` if set, else a container per run (Docker).

### 6. Turn it on: `cmd/server/modules.go`

The imports, beside the file's other imports (`cqrs` only for the app's first feature with
commands):

<!-- fragment: modules-import -->
```go
"github.com/jwcarman/roux/cqrs"
"roux-app/internal/labels"
```

The modules, at the end of the line that adds `email` and `members` (after them, so
`k.Organization()` holds the `ORG_*` settings). `cqrs.Module{}` comes once, before every module with
commands:

<!-- fragment: modules-append -->
```go
mods = append(mods, email, members, cqrs.Module{}, labels.Module{})
```

Its permissions, in `permissions()`:

<!-- fragment: permissions -->
```go
return slices.Concat(app.RouxPermissions(), labels.Permissions)
```

Then run `go test ./cmd/server` **twice**: the first run rewrites `frontend/src/permissions.gen.ts`
(adding `LABELS_READ` and `LABELS_MANAGE`) and `frontend/src/contract.gen.ts` (the `labels` query,
the `addLabel` command and their types) and fails so the change is noticed; the second passes. The
check script does this for you. In a grown app, add the feature's `Endpoints` to
`contract_test.go`'s list.

### 7. The surface: `frontend/src/labels/labels.surface.json`

The screen, drawn only from roux's catalog (`surfaces.md` lists every component and prop):

<!-- file: frontend/src/labels/labels.surface.json -->
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

- Top-level paths are the surface's data: `/labels` (the query's page), `/labelsArgs` (its search,
  filter, page and sort), `/draft` (the add form), `/errors` (the server's word on each field).
- A column's `sort` is one of the service's `Sort` values; its `field` a JSON member of the row.
- An option's `value` is spelled as `Colours` spells it; a check's `message` is roux's word for the
  rule (`problem.MustNotBeBlank` is `Must not be blank`).

Then generate its types, `frontend/src/labels/labels.surface.gen.ts` (`LabelsSurfaceData`,
`LabelsSurfaceEvents`), and run it again after every change to the JSON:

<!-- run: frontend -->
```bash
npm run surfaces
```

### 8. The binding: `frontend/src/labels/labels.binding.ts`

<!-- file: frontend/src/labels/labels.binding.ts -->
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

- Every top-level path is a `query(name, args)` or a `local(initial)`; every event a
  `command(name, build, { errors, onSuccess })` or `none()`. The compiler checks it against the
  generated types and the contract: a path or event left out, a field the query doesn't answer, an
  input member missing, each fails `npm run build` at its line.
- An arg read from a path (`d.labelsArgs.colour`) refetches when it changes; any change but the
  page's sends the page back to 0.
- `errors` gets each field problem the server answers (`/errors/name`); `onSuccess` runs after the
  queries that depend on `labelsChanged` have refetched.
- The binding is a module-level constant: a `bind()` inside a component makes a new binding each
  render, which restarts the surface.

### 9. The route and the nav entry

`frontend/src/routes/_signedIn/labels.tsx` (thin: the guard and the surface):

<!-- file: frontend/src/routes/_signedIn/labels.tsx -->
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

If the nearest feature's route uses a different guard import, copy it. The router plugin writes
`routeTree.gen.ts` on build and test.

`frontend/src/shell/nav.ts`, one more entry (`icon` from `react-icons/lu` only; `permission` the
one the route checks):

<!-- fragment: nav -->
```ts
import { LuHouse, LuPalette, LuTag, LuUsers } from "react-icons/lu"; // LuTag added to nav.ts's one icon import

{
  label: "Labels",
  to: "/labels",
  icon: LuTag,
  permission: "labels.read",
  description: "The tags an item can carry.",
},
```

### 10. The Vitest test: `frontend/src/labels/labels.binding.test.tsx`

The surface through its route, against MSW answers in the server's shapes:

<!-- file: frontend/src/labels/labels.binding.test.tsx -->
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

- Answer with MSW (`server.use`), never by mocking roux or the surface. `pageOf(rows, ...)` is a
  query's page; a command answers `{ result, events }`; `invalidFields({ field: message })` is a
  `400` with field problems. Type the rows with the contract's types (`LabelRow`).
- The fake server is strict: a request no handler answers fails the test.
- The first render loads the A2UI runtime: give the first `findBy...` a `{ timeout: 5000 }`.
- Coverage is 100%: the binding's `build` runs only when a test clicks the button.

## Add a field to an existing feature

1. A **new** migration: `alter table label add column ...` (a `not null` column on a table with
   rows needs a `default`); `drop view` and `create view` again when the list shows it.
2. Go: the input's member and its rule in `Validate`; the service's method and its SQL; the row's
   field with its `db` and `json` tags.
3. `go test ./cmd/server` twice (the contract changes).
4. The surface: the field (`InputField`, `SelectField`) in the form and its member in the button's
   `context`, the column in the table; `npm run surfaces`; the binding's `local` drafts and errors
   get the member.
5. Tests: the server's refusal for the new rule; the request body in the surface's test; every MSW
   answer that builds the row gets the field.

## Check

From the app's root, run the skill's check script (`bash <skill base directory>/scripts/check.sh`)
and fix what it reports until it ends `check: ok`. In the order the build needs, it runs `gofmt -w`,
the permissions and contract tests (each twice: they rewrite `permissions.gen.ts` and
`contract.gen.ts`), `go vet`, golangci-lint, the Go tests when a database is reachable, then the
frontend: Prettier, `npm run surfaces` (the surfaces' types), its tests with the 100% coverage gate,
its type-checked build (where a binding that misses something fails) and ESLint.

When it says the Go tests were skipped (no `TEST_DATABASE_URL` and no Docker), say so to the user,
and read each test against step 5: role names exist, bodies satisfy `Validate`, `a.Role` comes
before `a.Migrate`.

## Pitfalls

- A hand-written React page or form for a feature: draw it as a surface. What the catalog can't
  draw is a new primitive in roux-web (`surfaces.md`), not app React.
- Rules in `Run`: `Run` calls the service; a rule there is lost to every other adapter.
- A command without `cqrs.Module{}` turned on (or turned on after the feature): the command log's
  table is missing and every command is a `500`.
- `bind()` inside a component: the surface restarts on each render.
- A surface edited without `npm run surfaces`: the build and `surfaces:check` fail on the stale
  `*.surface.gen.ts`.
- A migration without `After: []string{"roux-users", "app-roles"}`, or `rouxtest.New` without
  `a.Role("USER")` before `a.Migrate(...)`: the grant to `USER` silently grants nothing.
- An enum spelled differently in `Colours`, the arg's `oneof`, and the surface's options: a `400`.
- A type named like another feature's (`Row`, `Input`) in an endpoint: the contract panics, naming
  both.
- Test data that breaks your own rules: read each body against `Validate`.
- SQL built with `+` from a value: always `$n` arguments.

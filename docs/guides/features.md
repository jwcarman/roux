# A feature's server side

A feature is a Go package in `internal/<feature>/`: its tables, made by its own SQL migrations; a
service that reads and writes them with pgx; handlers that check the request and answer JSON; and a
module that brings them into the app. There is no ORM and no code generator: the SQL is in the
package, next to the Go that runs it.

This guide builds the server side of one feature, from the table to the endpoint and its test.
The browser side is [API client](api-client.md), [Queries and mutations](queries-and-mutations.md),
[Forms](forms.md) and [Tables and paging](tables-and-paging.md).

## The files

For a feature `ranks` (the school's belts) in the app `roux-app`:

| File | What it is |
| --- | --- |
| `internal/ranks/migrations/001_rank.sql` | The table, and the grants of the feature's permissions |
| `internal/ranks/ranks.go` | The permissions, the module, its migrations |
| `internal/ranks/input.go` | The body a write sends, and its rules |
| `internal/ranks/service.go` | What the API answers, and the operations: the SQL and the refusals |
| `internal/ranks/handlers.go` | The endpoints under `/api/ranks`, each behind a permission |
| `internal/ranks/ranks_test.go` | The endpoints over a real database, one test per refusal ([Testing](testing.md)) |
| `cmd/server/modules.go` | One more module in the list, and its permissions in `permissions()` |

## The table

```sql
-- The school's ranks. Names are unique ignoring case.
create table rank (
    id          uuid        primary key default gen_random_uuid(),
    name        text        not null check (char_length(name) between 1 and 40),
    colour      text        not null,
    version     bigint      not null default 0,
    created_at  timestamptz not null,
    created_by  uuid        not null references roux_identity (id),
    modified_at timestamptz not null,
    modified_by uuid        not null references roux_identity (id)
);

create unique index rank_name_key on rank (lower(name));

-- Every member may see the ranks; only an owner may change them.
insert into roux_role_permission (role_id, permission)
select r.id, 'ranks.read' from roux_role r where r.name in ('USER', 'OWNER')
on conflict do nothing;

insert into roux_role_permission (role_id, permission)
select r.id, 'ranks.manage' from roux_role r where r.name = 'OWNER'
on conflict do nothing;
```

- **A migration is a `.sql` file in the feature's `migrations/` folder**, run in name order
  (`001_rank.sql`, then `002_...`), each in its own transaction, once. roux records each file it
  ran with a checksum (in `schema_history`), and **an edited file that has run stops startup**, so
  never edit one that has run anywhere. A later change is a new file (`002_rank_order.sql` with `alter table rank add column ...`).
- **`id uuid primary key default gen_random_uuid()`.** The database makes the id.
- **`version bigint not null default 0`**, raised by every update, so an edit made from an old
  copy is refused ([Errors](errors.md#refuse-a-stale-save)).
- **Who and when:** `created_at`, `created_by`, `modified_at`, `modified_by`, set by the service
  from its clock and the caller. A reference to a person is `references roux_identity (id)` (a
  person who signs in) or `references roux_user (id)` (a member of the team; see [Users](users.md)).
- **Text is `text` with a `check` on its length**, the same number as the Go constant (`MaxName`),
  so the database refuses what the API would.
- **Unique ignoring case** is a unique index on `lower(...)`. The service checks first, so the
  person sees a message under the field; the index guards the race the check cannot see (two saves
  at once), which roux answers `409`.
- **The feature's permissions are granted in its own migration**, after the roles exist. roux
  creates `OWNER`; the app's own roles (`USER`) are made by `cmd/server/migrations/`, which is why
  the module's migration runs `After` `app-roles` ([Roles and permissions](roles.md)).
- Write the SQL for what PostgreSQL 17 does: `check` constraints, partial and expression
  indexes, views, `on delete cascade`.

## The module

```go
// Package ranks is the school's ranks: the belts a student can hold. Everyone may see them; only
// an owner may change them.
package ranks

import (
	"context"
	"embed"
	"time"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/pgdb"
)

// The ranks' permissions (migrations/001_rank.sql grants them).
const (
	RanksRead   = "ranks.read"
	RanksManage = "ranks.manage"
)

// Permissions is every permission ranks checks, for the app's list of them.
var Permissions = []string{RanksRead, RanksManage}

//go:embed migrations/*.sql
var migrations embed.FS

// Module is the ranks feature: its table and its endpoints.
type Module struct {
	// Clock is the time changes are stamped with; time.Now when nil.
	Clock func() time.Time
}

func (Module) Name() string { return "ranks" }

func (Module) Migrations() []pgdb.Migration {
	return []pgdb.Migration{{Name: "ranks", FS: migrations, Dir: "migrations", After: []string{"roux-users", "app-roles"}}}
}

func (m Module) Mount(_ context.Context, k *app.Kit) error {
	now := m.Clock
	if now == nil {
		now = time.Now
	}
	Register(k, Service{Pool: k.Pool, Clock: now})
	return nil
}
```

- **The permissions are constants** in the package that checks them, and `Permissions` lists them
  for the app's list ([Roles and permissions](roles.md)).
- **`//go:embed migrations/*.sql`** puts the SQL in the binary. `Migrations()` names them: `Name`
  is unique in the app (lowercase words joined by `-`), and `After` names the migrations that must
  run first. A name nobody declared is ignored.
- **`Mount`** builds the service from the kit (`k.Pool`, `k.Organization` for the time zone) and
  registers the endpoints. A module with work to do after every module is mounted also has
  `Start(ctx, k) error` (checking a list's SQL, say: see
  [Tables and paging](tables-and-paging.md#the-server)).
- **The clock is a field**, `time.Now` when nil, so a test sets the time.

Then, in `cmd/server/modules.go`, the module joins the list and its permissions join the app's:

```go
mods = append(mods, email, members, ranks.Module{})
```

```go
func permissions() []string {
	return append(app.RouxPermissions(), ranks.Permissions...)
}
```

The next `go test ./cmd/server` rewrites `frontend/src/permissions.gen.ts` with `RANKS_READ` and
`RANKS_MANAGE` and fails once, so the change is committed; it also fails if `OWNER` lacks a
permission or a migration grants one nobody declares.

## The input

```go
package ranks

import (
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jwcarman/roux/problem"
)

// MaxName is the longest name, in characters (migrations/001_rank.sql checks it too).
const MaxName = 40

// Colours are the belts a rank may be.
var Colours = []string{"white", "yellow", "orange", "green", "blue", "brown", "black"}

// body is a write as it arrives; pointers tell "missing" from empty.
type body struct {
	Name    *string `json:"name"`
	Colour  *string `json:"colour"`
	Version *int64  `json:"version"`
}

// Input is a valid write.
type Input struct {
	Name, Colour string
}

// validate checks every field and answers every mistake at once; an edit must say which version
// it was made from.
func (b body) validate(edit bool) (Input, error) {
	var in Input
	var v []problem.Violation
	bad := func(field, message string) { v = append(v, problem.Violation{Field: field, Message: message}) }

	in.Name = strings.TrimSpace(deref(b.Name))
	switch n := utf8.RuneCountInString(in.Name); {
	case n == 0:
		bad("name", problem.MustNotBeBlank)
	case n > MaxName:
		bad("name", problem.MustBeBetween(1, MaxName))
	}
	in.Colour = deref(b.Colour)
	if !slices.Contains(Colours, in.Colour) {
		bad("colour", problem.MustBeOneOf(Colours...))
	}
	if edit && b.Version == nil {
		bad("version", problem.MustNotBeEmpty)
	}
	if len(v) > 0 {
		return Input{}, problem.Validation(v...)
	}
	return in, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
```

- **The body is a struct of pointers**, so a missing member is told from an empty one. It is
  unexported: the handlers decode it, and only a valid `Input` reaches the service.
- **`validate` checks every field and returns every mistake at once**, as `problem.Validation`, a
  `400` whose `errors` name each field. The form shows each under its field
  ([Forms](forms.md#useschemaform)).
- **The words are roux's** (`problem.MustNotBeBlank`, `problem.MustBeBetween(1, MaxName)`,
  `problem.MustBeOneOf(...)`), the same the browser's rules show, so the person reads one
  vocabulary. A message of the feature's own is a constant (`NameTaken`), so a test can name it.
- **Trim text before checking it**, and count characters with `utf8.RuneCountInString`, never
  `len` (bytes).
- An edit must carry the `version` it was made from; a create carries none.

## The service

```go
package ranks

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/problem"
)

// NameTaken is what a clash of names says, under the name field.
const NameTaken = "Another rank has this name"

// Rank is a rank as the API answers it.
type Rank struct {
	ID      uuid.UUID `json:"id"`
	Name    string    `json:"name"`
	Colour  string    `json:"colour"`
	Version int64     `json:"version"`
}

// Service is the ranks' operations.
type Service struct {
	Pool  *pgxpool.Pool
	Clock func() time.Time
}

const columns = `id, name, colour, version`

// List is every rank, by name.
func (s Service) List(ctx context.Context) ([]Rank, error) {
	rows, err := s.Pool.Query(ctx, `select `+columns+` from rank order by lower(name), id`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Rank])
}

// Get is one rank.
func (s Service) Get(ctx context.Context, id uuid.UUID) (Rank, error) {
	rows, err := s.Pool.Query(ctx, `select `+columns+` from rank where id = $1`, id)
	if err != nil {
		return Rank{}, err
	}
	r, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[Rank])
	if errors.Is(err, pgx.ErrNoRows) {
		return Rank{}, notFound()
	}
	return r, err
}

// Create adds a rank.
func (s Service) Create(ctx context.Context, caller *authn.Principal, in Input) (Rank, error) {
	var out Rank
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := uniqueName(ctx, tx, in.Name, uuid.Nil); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			insert into rank (name, colour, created_at, created_by, modified_at, modified_by)
			values ($1, $2, $3, $4, $3, $4) returning `+columns,
			in.Name, in.Colour, s.Clock(), caller.IdentityID)
		if err != nil {
			return err
		}
		out, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[Rank])
		return err
	})
	return out, err
}

// Update changes a rank, from the version the caller last saw.
func (s Service) Update(ctx context.Context, caller *authn.Principal, id uuid.UUID, version int64, in Input) (Rank, error) {
	var out Rank
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		var current int64
		err := tx.QueryRow(ctx, `select version from rank where id = $1 for update`, id).Scan(&current)
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound()
		}
		if err != nil {
			return err
		}
		// First, before anything changes: a stale version is a 409.
		if current != version {
			return problem.StaleVersion()
		}
		if err := uniqueName(ctx, tx, in.Name, id); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			update rank set name = $2, colour = $3, version = version + 1, modified_at = $4, modified_by = $5
			 where id = $1 returning `+columns,
			id, in.Name, in.Colour, s.Clock(), caller.IdentityID)
		if err != nil {
			return err
		}
		out, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[Rank])
		return err
	})
	return out, err
}

// Delete removes a rank.
func (s Service) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `delete from rank where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return notFound()
	}
	return nil
}

func notFound() error { return problem.NotFound("This rank no longer exists") }

// uniqueName refuses a name another rank has, ignoring case, under the name field.
func uniqueName(ctx context.Context, tx pgx.Tx, name string, self uuid.UUID) error {
	var taken bool
	if err := tx.QueryRow(ctx, `select exists (select 1 from rank where lower(name) = lower($1) and id <> $2)`,
		name, self).Scan(&taken); err != nil {
		return err
	}
	if taken {
		return problem.InvalidField("name", NameTaken)
	}
	return nil
}
```

- **What the API answers is a struct with JSON tags** (`Rank`), never a row type shared with
  another feature. It carries `version`, so the browser can send it back with an edit.
- **SQL text is a constant; values are always arguments** (`$1`, `$2`). Never build SQL from what
  a request sent.
- **A write is one transaction**: `pgx.BeginFunc` commits when the function returns nil and rolls
  back otherwise. `select ... for update` holds the row while the edit is checked.
- **An edit checks the version first**, before anything changes, and refuses a stale one with
  `problem.StaleVersion()` (`409`). The update raises `version`.
- **A missing row is `problem.NotFound("")`** (`404`); a clash on what the person typed is
  `problem.InvalidField(field, message)` (`400` on that field). Every refusal is a
  `*problem.Problem` returned as the error ([Errors](errors.md)); anything else is a `500` that
  says nothing about why and logs the cause.
- **Time comes from the service's clock**, today from the organization's zone
  ([Dates and time](dates-and-time.md)). A change worth a history is recorded with
  `activity.Append` in the same transaction ([The activity log](activity-log.md)).
- `pgx.RowToStructByPos[Rank]` reads the columns in order into the struct's fields; the `columns`
  constant keeps every query's list in that order.

## The handlers

```go
package ranks

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/authn"
)

// BasePath is where the ranks' endpoints live.
const BasePath = "/api/ranks"

// Register serves the ranks' endpoints. Each is a kit route: the CSRF token, a sign-in and the
// permission are checked before the handler runs.
//
//	GET    /api/ranks       every rank, by name               ranks.read
//	POST   /api/ranks       add a rank                        ranks.manage
//	GET    /api/ranks/{id}  one rank                          ranks.read
//	PUT    /api/ranks/{id}  change it, from its version (409) ranks.manage
//	DELETE /api/ranks/{id}  delete it                         ranks.manage
func Register(k *app.Kit, svc Service) {
	k.Handle("GET "+BasePath, RanksRead, func(w http.ResponseWriter, r *http.Request) error {
		out, err := svc.List(r.Context())
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	})
	k.Handle("POST "+BasePath, RanksManage, func(w http.ResponseWriter, r *http.Request) error {
		in, _, err := decode(r, false)
		if err != nil {
			return err
		}
		out, err := svc.Create(r.Context(), authn.PrincipalFrom(r.Context()), in)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusCreated, out)
	})
	k.Handle("GET "+BasePath+"/{id}", RanksRead, func(w http.ResponseWriter, r *http.Request) error {
		id, err := rankID(r)
		if err != nil {
			return err
		}
		out, err := svc.Get(r.Context(), id)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	})
	k.Handle("PUT "+BasePath+"/{id}", RanksManage, func(w http.ResponseWriter, r *http.Request) error {
		id, err := rankID(r)
		if err != nil {
			return err
		}
		in, version, err := decode(r, true)
		if err != nil {
			return err
		}
		out, err := svc.Update(r.Context(), authn.PrincipalFrom(r.Context()), id, version, in)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	})
	k.Handle("DELETE "+BasePath+"/{id}", RanksManage, func(w http.ResponseWriter, r *http.Request) error {
		id, err := rankID(r)
		if err != nil {
			return err
		}
		if err := svc.Delete(r.Context(), id); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	})
}

// decode reads and checks a write: a body that is not JSON, or has a member the API does not
// know, is a 400; so is every mistake validate finds.
func decode(r *http.Request, edit bool) (Input, int64, error) {
	var b body
	if err := api.Decode(r, &b); err != nil {
		return Input{}, 0, err
	}
	in, err := b.validate(edit)
	if err != nil {
		return Input{}, 0, err
	}
	var version int64
	if b.Version != nil {
		version = *b.Version
	}
	return in, version, nil
}

// rankID is the {id} in the path; one that is not a UUID names no rank.
func rankID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return uuid.Nil, notFound()
	}
	return id, nil
}
```

- **Every route is `k.Handle(pattern, permission, fn)`**: the CSRF token, a sign-in and the
  permission are checked before `fn` runs, so a signed-out caller gets `401` and one without the
  permission `403`. A route for anyone signed in is `k.HandleSignedIn`, and one for anybody (signed
  out too) `k.HandlePublic`; an empty permission panics at startup. Never mount an app route with
  `k.Mux.Handle`: it would be open, and startup warns that it is.
- **The pattern is Go's** (`net/http`): a method, a space, a path, `{id}` read with
  `r.PathValue("id")`.
- **A handler returns an error** and writes nothing when it does: roux answers a
  `*problem.Problem` as itself and anything else as a `500`.
- **`api.Decode`** reads one JSON object, refusing a member the API does not know, trailing data or
  a body that is not JSON, with a `400`. **`api.JSON(w, status, v)`** answers.
- A create answers `201` with what it made, an edit `200`, a delete `204`. An `{id}` that is not a
  UUID names nothing: `404`.
- **The handlers say nothing about the database**, and the service nothing about HTTP; the caller
  (`authn.PrincipalFrom(r.Context())`) is passed in.
- A long list answers a page instead ([Tables and paging](tables-and-paging.md#the-server)).

## The test

```go
package ranks_test

import (
	"testing"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/rouxtest"

	"roux-app/internal/ranks"
)

// setup is the ranks API over a fresh schema, with Olive (OWNER) and Ada (USER) signed in.
func setup(t *testing.T) (owner, user *authntest.Browser) {
	t.Helper()
	a := rouxtest.New(t, "ranks")
	a.Role("USER") // the app's own role, before ranks grants to it
	a.Migrate(ranks.Module{}.Migrations()...)
	ranks.Register(a.Kit(), ranks.Service{Pool: a.Pool, Clock: a.Clock.Now})
	a.Serve()
	return a.SignedIn(a.Person("Olive Owner", "OWNER")), a.SignedIn(a.Person("Ada Lovelace", "USER"))
}

func TestAnOwnerAddsARankThatEveryoneSees(t *testing.T) {
	owner, user := setup(t)
	added := owner.Post("/api/ranks", map[string]any{"name": " Yellow belt ", "colour": "yellow"}).
		Want(t, 201, "add").JSON(t)
	if added["name"] != "Yellow belt" || added["version"] != float64(0) {
		t.Fatalf("added %v", added)
	}
	var list []ranks.Rank
	user.Get("/api/ranks").Want(t, 200, "list").Decode(t, &list)
	if len(list) != 1 || list[0].Name != "Yellow belt" {
		t.Fatalf("list %v", list)
	}
}

func TestOnlyAnOwnerChangesRanks(t *testing.T) {
	_, user := setup(t)
	user.Post("/api/ranks", map[string]any{"name": "Yellow", "colour": "yellow"}).Want(t, 403, "a USER")
}

func TestARankNeedsANameAndAColourItKnows(t *testing.T) {
	owner, _ := setup(t)
	got := owner.Post("/api/ranks", map[string]any{"name": " ", "colour": "mauve"}).Want(t, 400, "bad").JSON(t)
	errs, _ := got["errors"].([]any)
	if len(errs) != 2 {
		t.Fatalf("errors %v", got)
	}
}

func TestTwoRanksMayNotShareANameIgnoringCase(t *testing.T) {
	owner, _ := setup(t)
	owner.Post("/api/ranks", map[string]any{"name": "Yellow", "colour": "yellow"}).Want(t, 201, "first")
	got := owner.Post("/api/ranks", map[string]any{"name": "YELLOW", "colour": "green"}).Want(t, 400, "second").JSON(t)
	if errs := got["errors"].([]any); errs[0].(map[string]any)["message"] != ranks.NameTaken {
		t.Fatalf("got %v", got)
	}
}

func TestAnEditFromAnOldVersionIsRefused(t *testing.T) {
	owner, _ := setup(t)
	id := owner.Post("/api/ranks", map[string]any{"name": "Yellow", "colour": "yellow"}).Want(t, 201, "add").JSON(t)["id"]
	path := "/api/ranks/" + id.(string)
	owner.Put(path, map[string]any{"name": "Gold", "colour": "yellow", "version": 0}).Want(t, 200, "edit")
	owner.Put(path, map[string]any{"name": "Amber", "colour": "yellow", "version": 0}).Want(t, 409, "stale")
	owner.Put(path, map[string]any{"name": "Amber", "colour": "yellow"}).Want(t, 400, "no version")
	owner.Delete(path).Want(t, 204, "delete")
	owner.Get(path).Want(t, 404, "gone")
	owner.Get("/api/ranks/"+uuid.NewString()).Want(t, 404, "never was")
}
```

`rouxtest.New` is the feature over a fresh schema with roux's tables, `Person` a member of the team
in a role, and `SignedIn` a browser signed in as them, with the CSRF token. [Testing](testing.md)
says more.

## Check it

- `make check` runs gofmt, `go vet`, golangci-lint and every test. The database tests start
  PostgreSQL in Docker, or use `TEST_DATABASE_URL`.
- A migration that fails stops every test that runs it, naming the file and PostgreSQL's error.
- `go test ./cmd/server` checks the permissions: the front end's list, and every grant.

## Don't

- Don't build SQL from what a request sent; pass values as arguments.
- Don't edit a migration that has run; add one.
- Don't mount an app route with `Mux.Handle`; use `k.Handle`, `k.HandleSignedIn` or
  `k.HandlePublic`.
- Don't answer a refusal by writing to the response; return a `*problem.Problem`.
- Don't compare versions after changing anything; check first.
- Don't catch a unique violation to turn the race into a field error: no test can make two saves
  race, and roux already answers it `409`.

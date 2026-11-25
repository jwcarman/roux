# Add a feature: the recipe

A new resource end to end: table, module, input, service, handlers, permissions, tests, then the
browser's module, form, page and route. The example is `labels` (a name and a colour) in an app
whose Go module is `roux-app`; replace `label`/`Label`/`labels` with the feature's names throughout,
and `roux-app` with the module line of the app's `go.mod`.

## First: find the nearest feature

In a grown app, open the existing feature most like the new one (`internal/<feature>/` and
`frontend/src/<feature>/`) and copy its files' shape: package, file names, imports and tests. Use
this recipe for the order, the exact roux names and the checks. In a new app there is none: follow
the recipe as written (`frontend/src/users/` shows the frontend shape).

## Rules

- A feature is one Go package, `internal/<feature>/`, with its SQL in `migrations/` beside it. No
  ORM, no code generator: the SQL is constant text in the package, values are always `$1`
  arguments (SQL built from what a request sent is an injection).
- What the API answers is a struct with JSON tags (`Label`) carrying `version`; an edit sends the
  `version` it was made from, which is how a stale save becomes a `409`.
- Refusals are `*problem.Problem` values returned as the error (`problem.NotFound`,
  `problem.InvalidField`, `problem.Validation`, `problem.StaleVersion`, `problem.Conflict`,
  `problem.BadRequest`). Never write an error response yourself: roux answers a problem as itself
  and anything else as a `500`, and the browser's forms read those problems. Messages are shown
  verbatim: write them for people.
- Every route is `k.Handle(pattern, permission, fn)`, a permission, never a role: roles are data
  the owner can change, permissions are code. `k.Mux.Handle` would leave the route open.
- The browser's rules come from roux's helpers (`text()`, `oneOf()`...), never
  `z.string().min(1, "...")`: the helpers carry the server's messages word for word.
- Pages never call the API or `fetch`; they use the module's queries and mutations, which add the
  CSRF header and turn errors into problems.
- A mutation names what it changes in `meta.refreshes`, never `invalidateQueries`: the form waits
  for those refreshes before it closes.
- Query keys only from `src/queryKeys.ts`, so a refresh names the same key the query used.
- Import roux-web only from its subpaths (`@jwcarman/roux-web/api`, `/form`, `/table`, ...): the
  package has no root export.
- Never edit a migration that has run (roux keeps a checksum, and an edited file stops startup);
  add a new one. Never hand-edit `permissions.gen.ts` or `routeTree.gen.ts`: tests and the build
  rewrite them.
- Time comes from the module's clock (`time.Now` when nil), today from the organization's zone
  (`dates.md`), so tests set the time.

## Steps

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

-- Every member may see the labels; only an owner may change them.
insert into roux_role_permission (role_id, permission)
select r.id, 'labels.read' from roux_role r where r.name in ('USER', 'OWNER')
on conflict do nothing;

insert into roux_role_permission (role_id, permission)
select r.id, 'labels.manage' from roux_role r where r.name = 'OWNER'
on conflict do nothing;
```

- Files run in name order, each once, in its own transaction. A later change is a new file
  (`002_label_order.sql`).
- The `check` repeats the Go limit (`MaxName`); the unique index on `lower(name)` guards the race
  the service's own check cannot see (roux answers it `409`).
- The grants are here, in the feature's own migration, by role **name**, never id (ids differ
  between databases). Grant to `OWNER` every permission; to `USER` (the app's role) what members
  may do.

### 2. The module: `internal/labels/labels.go`

<!-- file: internal/labels/labels.go -->
```go
// Package labels is the team's labels: the tags an item can carry. Everyone may see them; only
// an owner may change them.
package labels

import (
	"context"
	"embed"
	"time"

	"github.com/jwcarman/roux/app"
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

// Module is the labels feature: its table and its endpoints.
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
	Register(k, Service{Pool: k.Pool, Clock: now})
	return nil
}
```

- `After` must name `app-roles` (the migration that creates `USER`): without it the grant to `USER`
  may run first, finds no role, and grants nothing, silently.

### 3. The input: `internal/labels/input.go`

<!-- file: internal/labels/input.go -->
```go
package labels

import (
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jwcarman/roux/problem"
)

// MaxName is the longest name, in characters (migrations/001_label.sql checks it too).
const MaxName = 40

// Colours are the palettes a label may be shown in (Chakra UI's names).
var Colours = []string{"gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"}

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

- Pointers tell a missing member from an empty one. `validate` collects every mistake and answers
  them at once (`problem.Validation`): the form shows each under its field.
- The words are roux's constants and functions (`problem.MustNotBeBlank`,
  `problem.MustBeBetween`, `problem.MustBeOneOf`), the same the browser's helpers show. A message of
  the feature's own is a constant, so a test can name it.
- Trim before checking; count characters with `utf8.RuneCountInString`, never `len` (bytes).

### 4. The service: `internal/labels/service.go`

<!-- file: internal/labels/service.go -->
```go
package labels

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
const NameTaken = "Another label has this name"

// Label is a label as the API answers it.
type Label struct {
	ID      uuid.UUID `json:"id" db:"id"`
	Name    string    `json:"name" db:"name"`
	Colour  string    `json:"colour" db:"colour"`
	Version int64     `json:"version" db:"version"`
}

// Service is the labels' operations.
type Service struct {
	Pool  *pgxpool.Pool
	Clock func() time.Time
}

const columns = `id, name, colour, version`

// List is every label, by name.
func (s Service) List(ctx context.Context) ([]Label, error) {
	rows, err := s.Pool.Query(ctx, `select `+columns+` from label order by lower(name), id`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Label])
}

// Get is one label.
func (s Service) Get(ctx context.Context, id uuid.UUID) (Label, error) {
	rows, err := s.Pool.Query(ctx, `select `+columns+` from label where id = $1`, id)
	if err != nil {
		return Label{}, err
	}
	r, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Label])
	if errors.Is(err, pgx.ErrNoRows) {
		return Label{}, notFound()
	}
	return r, err
}

// Create adds a label.
func (s Service) Create(ctx context.Context, caller *authn.Principal, in Input) (Label, error) {
	var out Label
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := uniqueName(ctx, tx, in.Name, uuid.Nil); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			insert into label (name, colour, created_at, created_by, modified_at, modified_by)
			values ($1, $2, $3, $4, $3, $4) returning `+columns,
			in.Name, in.Colour, s.Clock(), caller.IdentityID)
		if err != nil {
			return err
		}
		out, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Label])
		return err
	})
	return out, err
}

// Update changes a label, from the version the caller last saw.
func (s Service) Update(ctx context.Context, caller *authn.Principal, id uuid.UUID, version int64, in Input) (Label, error) {
	var out Label
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		var current int64
		err := tx.QueryRow(ctx, `select version from label where id = $1 for update`, id).Scan(&current)
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
			update label set name = $2, colour = $3, version = version + 1, modified_at = $4, modified_by = $5
			 where id = $1 returning `+columns,
			id, in.Name, in.Colour, s.Clock(), caller.IdentityID)
		if err != nil {
			return err
		}
		out, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Label])
		return err
	})
	return out, err
}

// Delete removes a label.
func (s Service) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `delete from label where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return notFound()
	}
	return nil
}

func notFound() error { return problem.NotFound("This label no longer exists") }

// uniqueName refuses a name another label has, ignoring case, under the name field.
func uniqueName(ctx context.Context, tx pgx.Tx, name string, self uuid.UUID) error {
	var taken bool
	if err := tx.QueryRow(ctx, `select exists (select 1 from label where lower(name) = lower($1) and id <> $2)`,
		name, self).Scan(&taken); err != nil {
		return err
	}
	if taken {
		return problem.InvalidField("name", NameTaken)
	}
	return nil
}
```

- A write is one `pgx.BeginFunc` (commits on nil, rolls back otherwise); `for update` holds the row
  while the edit is checked.
- The version is compared **first**, before anything changes, and the update raises it.
- `pgx.RowToStructByName[Label]` fills each field from the column its `db` tag names; `columns`
  lists every one. Order does not matter; a column missing from either fails the first query.
- A missing row is `problem.NotFound(...)`; a clash on what the person typed is
  `problem.InvalidField(field, message)`. Anything else returned is a `500` that logs the cause.

### 5. The handlers: `internal/labels/handlers.go`

<!-- file: internal/labels/handlers.go -->
```go
package labels

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/authn"
)

// BasePath is where the labels' endpoints live.
const BasePath = "/api/labels"

// Register serves the labels' endpoints. Each is a kit route: the CSRF token, a sign-in and the
// permission are checked before the handler runs.
//
//	GET    /api/labels       every label, by name               labels.read
//	POST   /api/labels       add a label                        labels.manage
//	GET    /api/labels/{id}  one label                          labels.read
//	PUT    /api/labels/{id}  change it, from its version (409) labels.manage
//	DELETE /api/labels/{id}  delete it                         labels.manage
func Register(k *app.Kit, svc Service) {
	k.Handle("GET "+BasePath, LabelsRead, func(w http.ResponseWriter, r *http.Request) error {
		out, err := svc.List(r.Context())
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	})
	k.Handle("POST "+BasePath, LabelsManage, func(w http.ResponseWriter, r *http.Request) error {
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
	k.Handle("GET "+BasePath+"/{id}", LabelsRead, func(w http.ResponseWriter, r *http.Request) error {
		id, err := labelID(r)
		if err != nil {
			return err
		}
		out, err := svc.Get(r.Context(), id)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	})
	k.Handle("PUT "+BasePath+"/{id}", LabelsManage, func(w http.ResponseWriter, r *http.Request) error {
		id, err := labelID(r)
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
	k.Handle("DELETE "+BasePath+"/{id}", LabelsManage, func(w http.ResponseWriter, r *http.Request) error {
		id, err := labelID(r)
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

// labelID is the {id} in the path; one that is not a UUID names no label.
func labelID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return uuid.Nil, notFound()
	}
	return id, nil
}
```

- `k.Handle` checks the CSRF token, a sign-in and the permission before `fn` runs: `401` signed
  out, `403` without it. A permission no role holds stops startup, naming the route.
  `k.HandleSignedIn` is for any signed-in caller, `k.HandlePublic` for anybody.
- The pattern is Go's `net/http` one: method, space, path; `r.PathValue("id")` reads `{id}`.
- `api.Decode` refuses a body that is not one JSON object, or has a member the struct lacks
  (`400`); `api.JSON(w, status, v)` answers. Create `201`, edit `200`, delete `204`.
- The caller is `authn.PrincipalFrom(r.Context())`; pass it to the service.

### 6. Turn it on: `cmd/server/modules.go`

The import, beside the file's other imports:

<!-- fragment: modules-import -->
```go
"roux-app/internal/labels"
```

The module, at the end of the line that adds `email` and `members` (after them, so
`k.Organization()` holds the `ORG_*` settings):

<!-- fragment: modules-append -->
```go
mods = append(mods, email, members, labels.Module{})
```

Its permissions, in `permissions()`:

<!-- fragment: permissions -->
```go
return slices.Concat(app.RouxPermissions(), labels.Permissions)
```

Then run `go test ./cmd/server` **twice**: the first run rewrites
`frontend/src/permissions.gen.ts` (adding `LABELS_READ` and `LABELS_MANAGE`) and fails so the change
is noticed; the second passes. The check script (below) does this for you. Its other test fails,
naming it, if `OWNER` lacks a permission or a migration grants one nobody declared.

### 7. The Go test: `internal/labels/labels_test.go`

<!-- file: internal/labels/labels_test.go -->
```go
package labels_test

import (
	"testing"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/rouxtest"

	"roux-app/internal/labels"
)

// setup is the labels API over a fresh schema, with Olive (OWNER) and Ada (USER) signed in.
func setup(t *testing.T) (owner, user *authntest.Browser) {
	t.Helper()
	a := rouxtest.New(t, "labels")
	a.Role("USER") // the app's own role, before labels grants to it
	a.Migrate(labels.Module{}.Migrations()...)
	labels.Register(a.Kit(), labels.Service{Pool: a.Pool, Clock: a.Clock.Now})
	a.Serve()
	return a.SignedIn(a.Person("Olive Owner", "OWNER")), a.SignedIn(a.Person("Ada Lovelace", "USER"))
}

func TestAnOwnerAddsALabelThatEveryoneSees(t *testing.T) {
	owner, user := setup(t)
	added := owner.Post("/api/labels", map[string]any{"name": " Urgent ", "colour": "yellow"}).
		Want(t, 201, "add").JSON(t)
	if added["name"] != "Urgent" || added["version"] != float64(0) {
		t.Fatalf("added %v", added)
	}
	var list []labels.Label
	user.Get("/api/labels").Want(t, 200, "list").Decode(t, &list)
	if len(list) != 1 || list[0].Name != "Urgent" {
		t.Fatalf("list %v", list)
	}
}

func TestOnlyAnOwnerChangesLabels(t *testing.T) {
	_, user := setup(t)
	user.Post("/api/labels", map[string]any{"name": "Waiting", "colour": "yellow"}).Want(t, 403, "a USER")
}

func TestALabelNeedsANameAndAColourItKnows(t *testing.T) {
	owner, _ := setup(t)
	got := owner.Post("/api/labels", map[string]any{"name": " ", "colour": "mauve"}).Want(t, 400, "bad").JSON(t)
	errs, _ := got["errors"].([]any)
	if len(errs) != 2 {
		t.Fatalf("errors %v", got)
	}
}

func TestTwoLabelsMayNotShareANameIgnoringCase(t *testing.T) {
	owner, _ := setup(t)
	owner.Post("/api/labels", map[string]any{"name": "Waiting", "colour": "yellow"}).Want(t, 201, "first")
	got := owner.Post("/api/labels", map[string]any{"name": "WAITING", "colour": "green"}).Want(t, 400, "second").JSON(t)
	if errs := got["errors"].([]any); errs[0].(map[string]any)["message"] != labels.NameTaken {
		t.Fatalf("got %v", got)
	}
}

func TestAnEditFromAnOldVersionIsRefused(t *testing.T) {
	owner, _ := setup(t)
	id := owner.Post("/api/labels", map[string]any{"name": "Waiting", "colour": "yellow"}).Want(t, 201, "add").JSON(t)["id"]
	path := "/api/labels/" + id.(string)
	owner.Put(path, map[string]any{"name": "Blocked", "colour": "yellow", "version": 0}).Want(t, 200, "edit")
	owner.Put(path, map[string]any{"name": "On hold", "colour": "yellow", "version": 0}).Want(t, 409, "stale")
	owner.Put(path, map[string]any{"name": "On hold", "colour": "yellow"}).Want(t, 400, "no version")
	owner.Delete(path).Want(t, 204, "delete")
	owner.Get(path).Want(t, 404, "gone")
	owner.Get("/api/labels/"+uuid.NewString()).Want(t, 404, "never was")
}
```

- `rouxtest.New(t, "labels")` is a fresh schema with roux's tables. `a.Role("USER")` creates the
  app's role before the feature's migration grants to it (`OWNER` exists already).
- `a.Person(name, role)` makes a member of the team and returns their id; `a.SignedIn(id)` is a browser
  signed in as them, with the CSRF token. `Want(t, status, what)` fails with the body when the
  status differs; `.JSON(t)` and `.Decode(t, &v)` read the answer.
- One test per behaviour: a success, the permission (`403`), the field rules (`400`), the
  uniqueness, the stale edit (`409`), the missing version, delete and `404`.
- The tests need PostgreSQL: `TEST_DATABASE_URL` if set, else a container per run (Docker).

### 8. Query keys: `frontend/src/queryKeys.ts`

One more entry in `queryKeys`:

<!-- fragment: query-keys -->
```ts
labels: {
  all: ["labels"] as const,
  lists: () => [...queryKeys.labels.all, "list"] as const,
  detail: (id: string) => [...queryKeys.labels.all, "detail", id] as const,
},
```

### 9. The resource module: `frontend/src/labels/labels.ts`

<!-- file: frontend/src/labels/labels.ts -->
```ts
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

export const LABEL_COLOURS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type LabelColour = (typeof LABEL_COLOURS)[number];

export interface Label {
  id: string;
  name: string;
  colour: LabelColour;
  version: number;
}

/** The server's validate, in the browser: the same rules and words, without the version. */
export const labelRequestSchema = z.object({
  name: text().max(40),
  colour: oneOf(LABEL_COLOURS),
});
export type LabelRequest = z.output<typeof labelRequestSchema>;

export const labelsApi = {
  list: (signal?: AbortSignal) => getJson<Label[]>("labels", { signal }),
  create: (request: LabelRequest) => sendJson<Label>("POST", "labels", request),
  update: (id: string, request: LabelRequest & { version: number }) =>
    sendJson<Label>("PUT", path`labels/${id}`, request),
};

export const labelsQuery = queryOptions({
  queryKey: queryKeys.labels.lists(),
  queryFn: ({ signal }) => labelsApi.list(signal),
});

export const createLabel = mutationOptions({
  mutationFn: (request: LabelRequest) => labelsApi.create(request),
  meta: { refreshes: [queryKeys.labels.lists()] },
});

export const updateLabel = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: LabelRequest) => labelsApi.update(id, { ...request, version }),
    meta: { refreshes: [queryKeys.labels.detail(id), queryKeys.labels.lists()] },
  });
```

- Only what a page uses: every line must run in some test (the 100% gate). A remove button adds
  `remove` to `labelsApi` and a `removeLabel` mutation, with its tests.
- Paths are relative to `/api/` (`"labels"`, ``path`labels/${id}` ``). `path` encodes the values.
- Helpers mirror `validate` (step 3): `text()` ↔ trimmed and `problem.MustNotBeBlank`,
  `.max(n)` ↔ `problem.MustBeBetween(1, n)`, `oneOf(values)` ↔ `problem.MustBeOneOf(values...)`
  (the same values, spelled the same), `date()` ↔ a required date, `id()` ↔ a required UUID,
  `.optional()` when the server lets it be empty. Full table: `forms.md`.
- Two fields in order: `after(z.object({...}), { field: "endsOn", other: "startsOn" })`, called
  last, matching the server's own check of the two (`forms.md`).
- `update` sends the request and `version`, nothing else: `api.Decode` refuses a member the server
  does not take (`id`, say) with a `400`.

### 10. The form dialog: `frontend/src/labels/LabelFormDialog.tsx`

<!-- file: frontend/src/labels/LabelFormDialog.tsx -->
```tsx
import type { ReactElement } from "react";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { LABEL_COLOURS, createLabel, labelRequestSchema, updateLabel, type Label } from "./labels";

export function LabelFormDialog({ label, trigger }: { label?: Label; trigger: ReactElement }) {
  const form = useSchemaForm({
    schema: labelRequestSchema,
    defaultValues: label ? { name: label.name, colour: label.colour } : { name: "", colour: "" },
    mutation: label ? updateLabel(label.id, label.version) : createLabel,
    onSuccess: (saved) => notify.success(`${saved.name} was saved`),
  });

  return (
    <FormDialog form={form} title={label ? `Edit ${label.name}` : "New label"} trigger={trigger}>
      <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
      <form.AppField name="colour">
        {(f) => <f.SelectField label="Colour" options={LABEL_COLOURS} placeholder="Choose a colour" />}
      </form.AppField>
    </FormDialog>
  );
}
```

- Render a field for every key of the schema, or every submit is refused.
- `defaultValues` holds what inputs hold: `""` for blank text, dates and selects; a record's `null`
  through `inputOf(...)`.
- The form catches nothing and keeps no submitting state: `useSchemaForm` puts a 400's field
  errors under their fields, toasts the rest, waits for `meta.refreshes`, and `FormDialog` closes
  on success.
- A date field is `<f.InputField label="Starts on" type="date" />`. Other fields: `forms.md`.

### 11. The page: `frontend/src/labels/LabelsPage.tsx`

A short list (never more than a few hundred rows) is fetched whole with `SimpleQueryTable`:

<!-- file: frontend/src/labels/LabelsPage.tsx -->
```tsx
import { Button, Stack, VisuallyHidden } from "@chakra-ui/react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@jwcarman/roux-web/navigation";
import { SimpleQueryTable } from "@jwcarman/roux-web/table";
import { LabelFormDialog } from "./LabelFormDialog";
import { labelsQuery, type Label } from "./labels";

const column = createColumnHelper<Label>();

/** Module scope: columns built per render remount a row's open dialog. */
const COLUMNS: ColumnDef<Label, unknown>[] = [
  column.accessor("name", { header: "Name" }),
  column.accessor("colour", { header: "Colour" }),
  column.display({
    id: "actions",
    header: () => <VisuallyHidden>Actions</VisuallyHidden>,
    cell: ({ row }) => <LabelFormDialog label={row.original} trigger={<Button variant="outline">Edit</Button>} />,
  }),
];

export function LabelsPage() {
  return (
    <Stack gap="6">
      <PageHeader title="Labels">
        <LabelFormDialog trigger={<Button>New label</Button>} />
      </PageHeader>
      <SimpleQueryTable
        aria-label="Labels"
        query={labelsQuery}
        columns={COLUMNS}
        initialSort={{ id: "name", desc: false }}
        getRowId={(label) => label.id}
        emptyText="No labels yet."
        errorText="Could not load the labels."
      />
    </Stack>
  );
}
```

`SimpleQueryTable` sorts in the browser; its column ids are the accessor keys. "Soonest first" is
`initialSort={{ id: "startsOn", desc: false }}` (or the server's order). A remove button:
`useServerAction` with `useConfirm` (`feedback.md`).

### 12. The route and the nav entry

`frontend/src/routes/_signedIn/labels.tsx` (thin: guard and component):

<!-- file: frontend/src/routes/_signedIn/labels.tsx -->
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@jwcarman/roux-web/session";
import { LABELS_READ } from "../../permissions.gen";
import { LabelsPage } from "../../labels/LabelsPage";

export const Route = createFileRoute("/_signedIn/labels")({
  beforeLoad: ({ context }) => requirePermission(context.me, LABELS_READ),
  component: LabelsPage,
});
```

If the nearest feature's route uses a different guard import (an app's own `shell/guards`), copy it.
The router plugin writes `routeTree.gen.ts` on build and test.

`frontend/src/shell/nav.ts`, one more entry (`icon` from `react-icons/lu` only; `permission` the
one the route checks):

<!-- fragment: nav -->
```ts
import { LuHouse, LuPalette, LuTag, LuUsers } from "react-icons/lu"; // LuTag added to nav.ts's one icon import

{ label: "Labels", to: "/labels", icon: LuTag, permission: "labels.read", description: "The tags an item can carry." },
```

### 13. The Vitest tests: beside the code

<!-- file: frontend/src/labels/LabelFormDialog.test.tsx -->
```tsx
// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Toaster, toaster } from "@jwcarman/roux-web/feedback";
import { invalidFields, renderWithProviders, server } from "@jwcarman/roux-web/testing";
import { LabelFormDialog } from "./LabelFormDialog";

describe("LabelFormDialog", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });
  afterEach(() => {
    act(() => toaster.remove());
  });

  it("puts the server's field error under the field", async () => {
    server.use(http.post("/api/labels", () => invalidFields({ name: "Another label has this name" })));
    renderWithProviders(<LabelFormDialog trigger={<Button>Open</Button>} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.type(screen.getByLabelText(/^Name/), "Errand");
    await user.selectOptions(screen.getByLabelText(/^Colour/), "gray");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Another label has this name")).toBeInTheDocument();
  });

  it("edits a label at the version it read", async () => {
    let sent: unknown;
    server.use(
      http.put("/api/labels/l1", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ id: "l1", name: "Chore", colour: "gray", version: 4 });
      }),
    );
    const label = { id: "l1", name: "Errand", colour: "gray" as const, version: 3 };
    renderWithProviders(
      <>
        <LabelFormDialog label={label} trigger={<Button>Edit</Button>} />
        <Toaster />
      </>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText(/^Name/));
    await user.type(screen.getByLabelText(/^Name/), "Chore");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Chore was saved")).toBeInTheDocument();
    expect(sent).toEqual({ name: "Chore", colour: "gray", version: 3 });
  });
});
```

The page and its guard, through the router (`routes/_signedIn/-labels.test.tsx`; the `-` keeps it
out of the route tree):

<!-- file: frontend/src/routes/_signedIn/-labels.test.tsx -->
```tsx
// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@jwcarman/roux-web/testing";
import { LABELS_READ } from "../../permissions.gen";
import { renderRoute } from "../../testing/route";

describe("/labels", () => {
  it("lists the labels", async () => {
    server.use(http.get("/api/labels", () => HttpResponse.json([{ id: "l1", name: "Errand", colour: "gray", version: 0 }])));
    renderRoute("/labels", { permissions: [LABELS_READ] });
    const table = await screen.findByRole("table", { name: "Labels" });
    expect(await within(table).findByText("Errand")).toBeInTheDocument();
  });

  it("sends someone without the permission home", async () => {
    const { router } = renderRoute("/labels", { permissions: [] });
    await screen.findByRole("heading", { name: /^Welcome/ });
    expect(router.state.location.pathname).toBe("/");
  });
});
```

- A toast is seen only with `<Toaster />` rendered beside the component.
- Answer with MSW (`server.use`), never by mocking roux, the module or the query client.
  `invalidFields`, `notFound`, `stale`, `serverError` build the server's problems.
- The fake server is strict: a request no handler answers fails the test. A page that starts
  calling a new endpoint breaks every test that renders it:
  `grep -rlE "LabelsPage|/labels|/api/labels" frontend/src --include=*.test.tsx` and add handlers.
- A route test starts its file name with `-` (`routes/_signedIn/-labels.test.tsx`) and uses
  `renderRoute` from `src/testing/route.tsx`.
- Frontend coverage is 100% (`npm run coverage` enforces it): every line of the module, page, dialog
  and route must run in some test. Test create and edit in the dialog, the page's rows and empty
  text, the guard, and every button (remove: confirm, then the request).

## A long list (paged by the server)

Instead of `List` and the whole-list page: a view (`create view label_list as ...`), a
`page.New(page.ListConfig[Sort, Row]{...})` list in the service, `api.PageRequest` in the handler
answering a page, `pageQuery(...)` in the module, and `QueryTable` with its state in the URL
(`tableSearchOf`). All of it: `lists.md`.

## Add a field to an existing feature

1. A **new** migration file: `alter table label add column ...` (a `not null` column on a table with
   rows needs a `default`).
2. Go: the `body` member, `Input` field and its rule in `validate`; the `Label` field with its `db`
   tag, `columns`, and every `insert`/`update`.
3. The browser: the interface, the schema rule, and both `defaultValues` in the dialog; the dialog's
   `form.AppField`.
4. Tests: the server refusal for the new rule; the request body in the dialog test; every MSW
   answer that builds the record gets the field.

## Check

From the app's root, run the skill's check script (`bash <skill base directory>/scripts/check.sh`)
and fix what it reports until it ends `check: ok`. In the order the build needs, it runs `gofmt -w`
(formatting is checked later), the permissions test (rewrites `permissions.gen.ts`, which the
frontend build needs), `go vet`, golangci-lint (`make lint`, the app's pinned version), the Go tests when a database is
reachable, then the frontend's tests with the 100% coverage gate and its type-checked build. While
iterating on the frontend alone, `cd frontend && npm test` is quicker.

When it says the Go tests were skipped (no `TEST_DATABASE_URL` and no Docker), say so to the user,
and read each test against step 7: role names exist, bodies satisfy `validate`, `a.Role` comes
before `a.Migrate`.

## Pitfalls

- Test data that breaks your own rules (a blank name in a success test, a colour not in
  `Colours`): read each body against `validate`.
- A migration without `After: []string{"roux-users", "app-roles"}`: the grant to `USER` finds no
  role and silently grants nothing; members get `403`.
- `rouxtest.New` without `a.Role("USER")` before `a.Migrate(...)`: the same silent missing grant
  in tests.
- A migration edited after it ran: startup stops on the checksum. Add a new file.
- `permissions.gen.ts` stale: the frontend's route imports `LABELS_READ` and fails to compile. Run
  `go test ./cmd/server` (twice) or the check script; never edit the file.
- Colours (or any enum) spelled differently in Go and TypeScript: every save is a `400`.
- The update sending `id` or other members the server lacks: `api.Decode` answers `400`.
- SQL built with `+` from a value: always `$n` arguments; only constant text is concatenated.
- Columns defined inside the component: a dialog in a row closes by itself.
- A new endpoint called by an existing page: that page's tests fail on the unanswered request.
- Retyping a server message in the browser, or a `.refine` for a two-field order rule: use the
  helper or `after()`.
- `new QueryClient()` anywhere (tests included): `meta.refreshes` stops working; use
  `createQueryClient()` / `testQueryClient()`.
- Skipping `gofmt` after the last Go edit: the check fails on format alone.

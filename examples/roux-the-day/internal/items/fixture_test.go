package items_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/activity"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/authn/emaillink"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/users"

	"roux-the-day/internal/items"
)

// fx is the items API over a fresh schema, with a team: Olive (OWNER), Ada and Grace (USER).
type fx struct {
	*authntest.Env
	zone                string
	olive, ada, grace   uuid.UUID
	asOlive, asAda, asG *authntest.Browser
}

func setup(t *testing.T) *fx {
	t.Helper()
	env := authntest.New(t, "items", activity.Migration, emaillink.Migration, users.Migration)
	ctx := context.Background()
	// The app's own roles (cmd/server's migration), before items grants to them.
	if _, err := env.Pool.Exec(ctx, `insert into roux_role (id, name) values (gen_random_uuid(), 'USER')`); err != nil {
		t.Fatal(err)
	}
	if err := pgdb.Migrate(ctx, env.Pool, items.Module{}.Migrations()...); err != nil {
		t.Fatal(err)
	}
	f := &fx{Env: env, zone: "America/New_York"}
	items.Register(env.Mux, env.Host, items.Service{Pool: env.Pool, Clock: env.Clock.Now, Zone: func() string { return f.zone }})
	env.Serve()
	f.olive = f.person("Olive Owner", "OWNER")
	f.ada = f.person("Ada Lovelace", "USER")
	f.grace = f.person("Grace Hopper", "USER")
	f.asOlive, f.asAda, f.asG = f.SignedIn(f.olive), f.SignedIn(f.ada), f.SignedIn(f.grace)
	return f
}

// person adds a member of the team with the role.
func (f *fx) person(name, role string) uuid.UUID {
	f.T.Helper()
	ctx := context.Background()
	id, err := authn.CreateIdentity(ctx, f.Pool, f.Clock.Now())
	if err != nil {
		f.T.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `insert into roux_user (id, version, display_name) values ($1, 0, $2)`, id, name); err != nil {
		f.T.Fatal(err)
	}
	r, found, err := authz.FindRole(ctx, f.Pool, role)
	if err != nil || !found {
		f.T.Fatalf("role %s: %v %v", role, found, err)
	}
	if err := authz.Assign(ctx, f.Pool, id, r.ID); err != nil {
		f.T.Fatal(err)
	}
	return id
}

func (f *fx) deactivate(id uuid.UUID) {
	f.T.Helper()
	if _, err := f.Pool.Exec(context.Background(), `update roux_identity set status = 'DEACTIVATED' where id = $1`, id); err != nil {
		f.T.Fatal(err)
	}
}

// at moves the clock to a moment (the fixture's clock starts at 2026-11-24 12:00 UTC).
func (f *fx) at(moment time.Time) {
	f.Clock.Advance(moment.Sub(f.Clock.Now()))
}

// item is what a write sends; add fills in what a test does not care about.
type item map[string]any

func (f *fx) add(b *authntest.Browser, body item) map[string]any {
	f.T.Helper()
	full := item{"title": "Order the venue", "notes": "", "day": "2026-11-24", "at": nil, "assigneeIds": []string{f.ada.String()}}
	for k, v := range body {
		full[k] = v
	}
	return b.Post("/api/items", full).Want(f.T, 201, "POST /api/items").JSON(f.T)
}

// titles is the titles of a list's page, in order.
func (f *fx) titles(b *authntest.Browser, query string) []string {
	f.T.Helper()
	var pg struct {
		Data []struct {
			Title string `json:"title"`
		} `json:"data"`
	}
	b.Get("/api/items"+query).Want(f.T, 200, "GET /api/items"+query).Decode(f.T, &pg)
	out := []string{}
	for _, r := range pg.Data {
		out = append(out, r.Title)
	}
	return out
}

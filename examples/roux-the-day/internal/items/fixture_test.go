package items_test

import (
	"testing"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/rouxtest"

	"roux-the-day/internal/items"
)

// fx is the items API over a fresh schema, with a team: Olive (OWNER), Ada and Grace (USER).
type fx struct {
	*rouxtest.App
	zone                string
	olive, ada, grace   uuid.UUID
	asOlive, asAda, asG *authntest.Browser
}

func setup(t *testing.T) *fx {
	t.Helper()
	a := rouxtest.New(t, "items")
	a.Role("USER") // the app's own role (cmd/server's migration), before items grants to it
	a.Migrate(items.Module{}.Migrations()...)
	f := &fx{App: a, zone: "America/New_York"}
	items.Register(a.Kit(), items.Service{Pool: a.Pool, Clock: a.Clock.Now, Zone: func() string { return f.zone }})
	a.Serve()
	f.olive = a.Person("Olive Owner", "OWNER")
	f.ada = a.Person("Ada Lovelace", "USER")
	f.grace = a.Person("Grace Hopper", "USER")
	f.asOlive, f.asAda, f.asG = a.SignedIn(f.olive), a.SignedIn(f.ada), a.SignedIn(f.grace)
	return f
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

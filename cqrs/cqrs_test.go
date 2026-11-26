package cqrs_test

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/cqrs"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/problem"
	"github.com/jwcarman/roux/rouxtest"
)

type pgxTx = pgx.Tx

func itoa(n int) string { return strconv.Itoa(n) }

const thingsPermission = "things.use"

type thingRow struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type thingArgs struct {
	Status string `query:"status" oneof:"open,done"`
}

type counts struct {
	Open int `json:"open"`
}

type addThing struct {
	Title string `json:"title"`
}

func (a addThing) Validate() (addThing, error) {
	if a.Title == "" {
		return a, problem.InvalidField("title", "Is required")
	}
	return a, nil
}

// seen is what the last query or lookup received.
type seen struct {
	args   thingArgs
	caller *authn.Principal
}

type world struct {
	*rouxtest.App
	seen *seen
	// started is closed when slowAdd is inside its transaction; release lets it finish.
	started, release chan struct{}
	ada              *authntest.Browser
}

// setup serves a things table through two queries (one paged, one a lookup) and two commands over
// a fresh schema, with Ada holding the permission and Bo not.
func setup(t *testing.T, endpoints ...cqrs.Endpoint) *world {
	t.Helper()
	a := rouxtest.New(t, "cqrs", cqrs.Module{}.Migrations()...)
	a.Role("USER", thingsPermission)
	a.Role("GUEST")
	if _, err := a.Pool.Exec(context.Background(), `create table things (id serial primary key, title text not null)`); err != nil {
		t.Fatal(err)
	}
	got := &seen{}
	started, release := make(chan struct{}), make(chan struct{})
	if len(endpoints) == 0 {
		endpoints = standard(got, started, release)
	}
	cqrs.Mount(a.Kit(), endpoints...)
	a.Serve()
	return &world{App: a, seen: got, started: started, release: release, ada: a.SignedIn(a.Person("Ada", "USER"))}
}

func standard(got *seen, started, release chan struct{}) []cqrs.Endpoint {
	var once, failed sync.Once
	return []cqrs.Endpoint{
		cqrs.Command[addThing, thingRow]{
			Name: "slowAdd", Permission: thingsPermission,
			Run: func(ctx context.Context, tx pgxTx, _ *authn.Principal, in addThing) (thingRow, error) {
				once.Do(func() { close(started) })
				<-release
				var id int
				err := tx.QueryRow(ctx, `insert into things (title) values ($1) returning id`, in.Title).Scan(&id)
				return thingRow{ID: itoa(id), Title: in.Title}, err
			},
		},
		cqrs.Command[addThing, thingRow]{
			Name: "failOnce", Permission: thingsPermission,
			Run: func(ctx context.Context, tx pgxTx, _ *authn.Principal, in addThing) (thingRow, error) {
				fail := false
				failed.Do(func() { fail = true })
				if fail {
					return thingRow{}, problem.Conflict("Try again")
				}
				var id int
				err := tx.QueryRow(ctx, `insert into things (title) values ($1) returning id`, in.Title).Scan(&id)
				return thingRow{ID: itoa(id), Title: in.Title}, err
			},
		},
		cqrs.Query[thingArgs, thingRow]{
			Name: "things", Permission: thingsPermission,
			Paging: page.Config{DefaultSize: 2, MaxSize: 10, SortFields: []string{"ID"}, DefaultSort: "ID"},
			Run: func(_ context.Context, _ page.Querier, caller *authn.Principal, req page.Request, _ string, args thingArgs) (page.Page[thingRow], error) {
				got.args, got.caller = args, caller
				rows := []thingRow{{"1", "Ada"}, {"2", "Grace"}, {"3", "Edsger"}}
				return page.Of(rows[req.Offset():min(req.Offset()+req.Size, len(rows))], req, int64(len(rows))), nil
			},
		},
		cqrs.Lookup[cqrs.NoArgs, counts]{
			Name: "counts", Permission: thingsPermission,
			Run: func(context.Context, page.Querier, *authn.Principal, cqrs.NoArgs) (counts, error) {
				return counts{Open: 2}, nil
			},
		},
		cqrs.Command[addThing, thingRow]{
			Name: "addThing", Permission: thingsPermission, Emits: []string{"thingsChanged"},
			Run: func(ctx context.Context, tx pgxTx, _ *authn.Principal, in addThing) (thingRow, error) {
				var id int
				err := tx.QueryRow(ctx, `insert into things (title) values ($1) returning id`, in.Title).Scan(&id)
				return thingRow{ID: itoa(id), Title: in.Title}, err
			},
		},
		cqrs.Command[addThing, thingRow]{
			Name: "addThingThenFail", Permission: thingsPermission,
			Run: func(ctx context.Context, tx pgxTx, _ *authn.Principal, in addThing) (thingRow, error) {
				if _, err := tx.Exec(ctx, `insert into things (title) values ($1)`, in.Title); err != nil {
					return thingRow{}, err
				}
				return thingRow{}, problem.Conflict("No room for another thing")
			},
		},
		cqrs.Command[addThing, thingRow]{
			Name: "addOther", Permission: thingsPermission,
			Run: func(context.Context, pgxTx, *authn.Principal, addThing) (thingRow, error) { return thingRow{}, nil },
		},
	}
}

func (w *world) thingCount() int {
	w.T.Helper()
	var n int
	if err := w.Pool.QueryRow(context.Background(), `select count(*) from things`).Scan(&n); err != nil {
		w.T.Fatal(err)
	}
	return n
}

// csrf adds the CSRF header roux-web sends, so a request with extra headers is as a browser's.
func (w *world) csrf(b *authntest.Browser, headers map[string]string) map[string]string {
	w.T.Helper()
	if b.Cookie("XSRF-TOKEN") == "" {
		b.Get("/api/roux/auth/sign-in")
	}
	headers["X-XSRF-TOKEN"] = b.Cookie("XSRF-TOKEN")
	return headers
}

func newKey() string { return uuid.NewString() }

func TestMountPanicsOnADuplicateName(t *testing.T) {
	a := rouxtest.New(t, "cqrs_dup", cqrs.Module{}.Migrations()...)
	dup := cqrs.Lookup[cqrs.NoArgs, counts]{Name: "things", Permission: thingsPermission,
		Run: func(context.Context, page.Querier, *authn.Principal, cqrs.NoArgs) (counts, error) {
			return counts{}, nil
		}}
	defer func() {
		want := `cqrs: two endpoints are named "things"; give each its own name`
		if got := recover(); got != want {
			t.Fatalf("panic: want %q, got %v", want, got)
		}
	}()
	cqrs.Mount(a.Kit(), dup, dup)
}

func TestModuleIsNamedAndMigratesAfterUsers(t *testing.T) {
	m := cqrs.Module{}.Migrations()
	if (cqrs.Module{}).Name() != "roux-cqrs" || len(m) != 1 || m[0].Name != "roux-cqrs" || m[0].After[0] != "roux-users" {
		t.Fatalf("module: %+v", m)
	}
}

func TestMountRefusesAnEndpointWithNoPermission(t *testing.T) {
	a := rouxtest.New(t, "cqrs_noperm", cqrs.Module{}.Migrations()...)
	open := cqrs.Lookup[cqrs.NoArgs, counts]{Name: "open",
		Run: func(context.Context, page.Querier, *authn.Principal, cqrs.NoArgs) (counts, error) {
			return counts{}, nil
		}}
	defer func() {
		if got, _ := recover().(string); !strings.Contains(got, "names no permission") {
			t.Fatalf("want a panic naming the missing permission, got %q", got)
		}
	}()
	cqrs.Mount(a.Kit(), open)
}

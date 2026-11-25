package activity_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/activity"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/pgtest"
)

type renamed struct {
	From string `json:"from"`
	To   string `json:"to"`
}

func (renamed) Type() string       { return "thing.renamed" }
func (a renamed) Describe() string { return "Renamed from " + a.From + " to " + a.To }

type created struct{}

func (created) Type() string     { return "thing.created" }
func (created) Describe() string { return "Created" }

type custom struct{ code, text string }

func (a custom) Type() string     { return a.code }
func (a custom) Describe() string { return a.text }

type notAStruct string

func (notAStruct) Type() string     { return "thing.odd" }
func (notAStruct) Describe() string { return "Odd" }

func setup(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := pgtest.Pool(t, "activity")
	if err := pgdb.Migrate(context.Background(), pool, authn.Migration, activity.Migration); err != nil {
		t.Fatal(err)
	}
	return pool
}

func req(t *testing.T, index, size int) page.Request {
	t.Helper()
	r, err := page.Config{}.Resolve(&index, &size, "", "")
	if err != nil {
		t.Fatal(err)
	}
	return r
}

var t0 = time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)

func TestAppendRefusesWhatCouldNeverBeReadBack(t *testing.T) {
	pool := setup(t)
	ctx, anchor := context.Background(), uuid.New()
	cases := []struct {
		name string
		a    activity.Activity
		want string
	}{
		{"not a struct", notAStruct("x"), "must be a struct"},
		{"upper case type", custom{"Thing.Renamed", "x"}, "lower-case dotted code"},
		{"undotted type", custom{"renamed", "x"}, "lower-case dotted code"},
		{"type too long", custom{"a." + strings.Repeat("b", 100), "x"}, "lower-case dotted code"},
		{"blank description", custom{"thing.done", ""}, "description"},
		{"long description", custom{"thing.done", strings.Repeat("x", 501)}, "description"},
	}
	for _, c := range cases {
		if err := activity.Append(ctx, pool, t0, anchor, c.a); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v, want containing %q", c.name, err, c.want)
		}
	}
	if err := activity.Append(ctx, pool, t0, uuid.Nil, created{}); err == nil {
		t.Error("a nil anchor must be refused")
	}
	if err := activity.Append(ctx, pool, t0, anchor, created{}, uuid.Nil); err == nil {
		t.Error("a nil related id must be refused")
	}
	// Nothing refused was written.
	var n int
	if err := pool.QueryRow(ctx, `select count(*) from roux_activity`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("%d rows written by refused appends", n)
	}
}

func TestHistoryIsNewestFirstAndPaged(t *testing.T) {
	pool := setup(t)
	ctx, id := context.Background(), uuid.New()
	for i, to := range []string{"a", "b", "c", "d", "e"} {
		if err := activity.Append(ctx, pool, t0.Add(time.Duration(i)*time.Minute), id, renamed{From: "x", To: to}); err != nil {
			t.Fatal(err)
		}
	}
	first, err := activity.History(ctx, pool, nil, id, req(t, 0, 2))
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Data) != 2 || first.Data[0].Description != "Renamed from x to e" || first.Data[1].Description != "Renamed from x to d" {
		t.Fatalf("page 0: %+v", first.Data)
	}
	if p := first.Pagination; p.TotalElementCount != 5 || p.TotalPageCount != 3 || !p.HasNext || p.HasPrevious {
		t.Fatalf("pagination: %+v", p)
	}
	last, _ := activity.History(ctx, pool, nil, id, req(t, 2, 2))
	if len(last.Data) != 1 || last.Data[0].Description != "Renamed from x to a" || last.Pagination.HasNext {
		t.Fatalf("last page: %+v", last.Data)
	}
	if none, _ := activity.History(ctx, pool, nil, uuid.New(), req(t, 0, 20)); none.Data == nil || len(none.Data) != 0 {
		t.Fatalf("a record with no history has an empty list, not null: %+v", none)
	}
}

func TestEntriesCarryTheirFactsAsJSON(t *testing.T) {
	pool := setup(t)
	ctx, id := context.Background(), uuid.New()
	if err := activity.Append(ctx, pool, t0, id, renamed{From: "Ada", To: "Ada King"}); err != nil {
		t.Fatal(err)
	}
	if err := activity.Append(ctx, pool, t0.Add(time.Second), id, created{}); err != nil {
		t.Fatal(err)
	}
	h, _ := activity.History(ctx, pool, nil, id, req(t, 0, 20))

	got, _ := json.Marshal(h.Data[0])
	var m map[string]any
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	if m["type"] != "thing.created" || m["description"] != "Created" || m["actorId"] != nil || m["actorName"] != "System" ||
		m["occurredAt"] != "2026-11-24T12:00:01Z" || string(h.Data[0].Details) != "{}" {
		t.Fatalf("entry: %s", got)
	}
	// jsonb normalizes key order and spacing, so compare what it means.
	var details map[string]string
	if err := json.Unmarshal(h.Data[1].Details, &details); err != nil || details["from"] != "Ada" || details["to"] != "Ada King" || len(details) != 2 {
		t.Fatalf("details: %s (%v)", h.Data[1].Details, err)
	}
}

func TestAnActivityShowsInTheHistoryOfEveryRecordItConcerns(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	anchor, related, bystander := uuid.New(), uuid.New(), uuid.New()
	// related listed twice and the anchor listed among them: each counted once.
	if err := activity.Append(ctx, pool, t0, anchor, created{}, related, related, anchor); err != nil {
		t.Fatal(err)
	}
	for name, id := range map[string]uuid.UUID{"anchor": anchor, "related": related} {
		if h, _ := activity.History(ctx, pool, nil, id, req(t, 0, 20)); len(h.Data) != 1 || h.Pagination.TotalElementCount != 1 {
			t.Errorf("%s should see it once: %+v", name, h.Data)
		}
	}
	if h, _ := activity.History(ctx, pool, nil, bystander, req(t, 0, 20)); len(h.Data) != 0 {
		t.Errorf("a bystander saw it: %+v", h.Data)
	}
}

func TestActorsAreNamedFromTheirPrincipalAndTheirNames(t *testing.T) {
	pool := setup(t)
	ctx, id := context.Background(), uuid.New()
	known, nameless := uuid.New(), uuid.New()
	as := func(actor uuid.UUID) context.Context {
		return authn.WithPrincipal(ctx, &authn.Principal{IdentityID: actor})
	}

	if err := activity.Append(as(known), pool, t0, id, created{}); err != nil {
		t.Fatal(err)
	}
	if err := activity.Append(as(nameless), pool, t0.Add(time.Second), id, created{}); err != nil {
		t.Fatal(err)
	}
	// no one signed in: the system
	if err := activity.Append(ctx, pool, t0.Add(2*time.Second), id, created{}); err != nil {
		t.Fatal(err)
	}
	if err := activity.Append(as(known), pool, t0.Add(3*time.Second), id, created{}); err != nil {
		t.Fatal(err)
	}

	calls := 0
	names := func(_ context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
		calls++
		if len(ids) != 2 {
			t.Errorf("the names should be asked for once, for the two distinct actors: %v", ids)
		}
		return map[uuid.UUID]string{known: "Olive Owner"}, nil
	}
	h, err := activity.History(ctx, pool, names, id, req(t, 0, 20))
	if err != nil || calls != 1 {
		t.Fatalf("%v, %d lookups", err, calls)
	}
	got := []string{h.Data[0].ActorName, h.Data[1].ActorName, h.Data[2].ActorName, h.Data[3].ActorName}
	want := []string{"Olive Owner", "System", "Unknown", "Olive Owner"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("actor names (newest first) = %v, want %v", got, want)
		}
	}

	// No actors at all: nobody is asked.
	onlySystem := uuid.New()
	if err := activity.Append(ctx, pool, t0, onlySystem, created{}); err != nil {
		t.Fatal(err)
	}
	asked := false
	if _, err := activity.History(ctx, pool, func(context.Context, []uuid.UUID) (map[uuid.UUID]string, error) { asked = true; return nil, nil },
		onlySystem, req(t, 0, 20)); err != nil {
		t.Fatal(err)
	}
	if asked {
		t.Error("names were looked up for a history with no actors")
	}
}

func TestAppendBelongsToTheCallersTransaction(t *testing.T) {
	pool := setup(t)
	ctx, id := context.Background(), uuid.New()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := activity.Append(ctx, tx, t0, id, created{}); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if h, _ := activity.History(ctx, pool, nil, id, req(t, 0, 20)); len(h.Data) != 0 {
		t.Fatalf("a rolled-back change left its record behind: %+v", h.Data)
	}
}

package pgdb_test

import (
	"context"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/pgtest"
)

func mig(name string, after, before []string) pgdb.Migration {
	return pgdb.Migration{Name: name, After: after, Before: before}
}

func names(ms []pgdb.Migration) string {
	var out []string
	for _, m := range ms {
		out = append(out, m.Name)
	}
	return strings.Join(out, ",")
}

func TestOrder(t *testing.T) {
	tests := []struct {
		name    string
		in      []pgdb.Migration
		want    string
		wantErr string
	}{
		{"independent run in name order",
			[]pgdb.Migration{mig("zeta", nil, nil), mig("alpha", nil, nil), mig("mid", nil, nil)},
			"alpha,mid,zeta", ""},
		{"after",
			[]pgdb.Migration{mig("a-app", []string{"z-lib"}, nil), mig("z-lib", nil, nil)},
			"z-lib,a-app", ""},
		{"before",
			[]pgdb.Migration{mig("a-late", nil, nil), mig("z-early", nil, []string{"a-late"})},
			"z-early,a-late", ""},
		{"diamond (docs example)",
			[]pgdb.Migration{
				mig("roux", []string{"who-rbac"}, nil),
				mig("who-rbac", []string{"who-jdbc"}, nil),
				mig("who-apikey", []string{"who-jdbc"}, nil),
				mig("who-jdbc", nil, nil)},
			"who-jdbc,who-apikey,who-rbac,roux", ""},
		{"unknown names are ignored",
			[]pgdb.Migration{mig("a", []string{"nobody"}, []string{"ghost"})},
			"a", ""},
		{"duplicate", []pgdb.Migration{mig("a", nil, nil), mig("a", nil, nil)}, "", "duplicate"},
		{"bad name", []pgdb.Migration{mig("Bad_Name", nil, nil)}, "", "invalid migration name"},
		{"double dash", []pgdb.Migration{mig("a--b", nil, nil)}, "", "invalid migration name"},
		{"self reference", []pgdb.Migration{mig("a", []string{"a"}, nil)}, "", "after itself"},
		{"cycle",
			[]pgdb.Migration{mig("a", []string{"b"}, nil), mig("b", []string{"c"}, nil), mig("c", []string{"a"}, nil), mig("ok", nil, nil)},
			"", "cycle among: a, b, c"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := pgdb.Order(tt.in)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("err = %v, want containing %q", err, tt.wantErr)
				}
				return
			}
			if err != nil || names(got) != tt.want {
				t.Fatalf("got %s (%v), want %s", names(got), err, tt.want)
			}
		})
	}

	// Input order must never matter.
	in := []pgdb.Migration{mig("c", nil, nil), mig("a", nil, nil), mig("b", []string{"c"}, nil)}
	rev := []pgdb.Migration{in[2], in[1], in[0]}
	a, _ := pgdb.Order(in)
	b, _ := pgdb.Order(rev)
	if names(a) != names(b) {
		t.Fatalf("order depends on input: %s vs %s", names(a), names(b))
	}
}

// schemaURL is the test database's URL in a schema of the test's own, made afresh: migrations
// write schema_history, which other packages' tests write too when they share public.
func schemaURL(t *testing.T, schema string) string {
	t.Helper()
	pgtest.Pool(t, schema) // makes the schema, empty
	u, err := url.Parse(pgtest.URL(t))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	return u.String()
}

func TestMigrate(t *testing.T) {
	dsn := schemaURL(t, "pgdb_migrate")
	ctx := context.Background()
	pool, err := pgdb.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	cleanup := func() {
		_, _ = pool.Exec(ctx, "drop table if exists mt_child, mt_parent")
		_, _ = pool.Exec(ctx, "delete from schema_history where library like 'mt-%'")
	}
	cleanup()
	t.Cleanup(cleanup)

	// "mt-child" is passed first but depends on "mt-parent", whose table it references.
	parent := pgdb.Migration{Name: "mt-parent", Dir: "db", FS: fstest.MapFS{
		"db/001_parent.sql": {Data: []byte("create table mt_parent (id int primary key)")},
	}}
	child := pgdb.Migration{Name: "mt-child", Dir: "db", After: []string{"mt-parent"}, FS: fstest.MapFS{
		"db/001_child.sql": {Data: []byte("create table mt_child (parent_id int references mt_parent(id))")},
	}}

	if err := pgdb.Migrate(ctx, pool, child, parent); err != nil {
		t.Fatalf("first run: %v", err)
	}
	if err := pgdb.Migrate(ctx, pool, child, parent); err != nil {
		t.Fatalf("re-run must be a no-op: %v", err)
	}
	var n int
	if err := pool.QueryRow(ctx, "select count(*) from schema_history where library like 'mt-%'").Scan(&n); err != nil || n != 2 {
		t.Fatalf("history rows = %d, %v", n, err)
	}

	// Editing an applied migration is rejected.
	edited := parent
	edited.FS = fstest.MapFS{"db/001_parent.sql": {Data: []byte("create table mt_parent (id bigint primary key)")}}
	if err := pgdb.Migrate(ctx, pool, child, edited); err == nil || !strings.Contains(err.Error(), "modified after it was applied") {
		t.Fatalf("want checksum error, got %v", err)
	}

	// A failing migration rolls back and is not recorded.
	bad := pgdb.Migration{Name: "mt-bad", Dir: "db", FS: fstest.MapFS{
		"db/001_bad.sql": {Data: []byte("create table mt_child2 (id int); select nope from nowhere")},
	}}
	if err := pgdb.Migrate(ctx, pool, bad); err == nil {
		t.Fatal("want error from bad migration")
	}
	if err := pool.QueryRow(ctx, "select count(*) from schema_history where library = 'mt-bad'").Scan(&n); err != nil || n != 0 {
		t.Fatalf("bad migration recorded: %d, %v", n, err)
	}
}

// Several "instances" (each with its own pool) migrate at once. The SQL is not
// idempotent, so any failure of mutual exclusion shows up as "already exists".
func TestMigrateConcurrentInstances(t *testing.T) {
	dsn := schemaURL(t, "pgdb_migrate_concurrent")
	ctx := context.Background()
	admin, err := pgdb.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	cleanup := func() {
		_, _ = admin.Exec(ctx, "drop table if exists mt_conc")
		_, _ = admin.Exec(ctx, "delete from schema_history where library = 'mt-conc'")
	}
	cleanup()
	t.Cleanup(cleanup)

	m := pgdb.Migration{Name: "mt-conc", Dir: "db", FS: fstest.MapFS{
		"db/001_conc.sql": {Data: []byte("select pg_sleep(0.2); create table mt_conc (id int)")},
	}}
	const instances = 8
	errs := make(chan error, instances)
	for range instances {
		go func() {
			pool, err := pgdb.Connect(ctx, dsn)
			if err != nil {
				errs <- err
				return
			}
			defer pool.Close()
			errs <- pgdb.Migrate(ctx, pool, m)
		}()
	}
	for range instances {
		if err := <-errs; err != nil {
			t.Fatalf("instance failed: %v", err)
		}
	}
	var n int
	if err := admin.QueryRow(ctx, "select count(*) from schema_history where library = 'mt-conc'").Scan(&n); err != nil || n != 1 {
		t.Fatalf("history rows = %d, %v", n, err)
	}
}

// A crashed instance must not leave a stuck lock (the classic failure of
// lock-table designs). The lock belongs to the database session, so when that
// session dies, waiting instances proceed with no manual cleanup.
func TestMigrateLockReleasedWhenHolderDies(t *testing.T) {
	dsn := schemaURL(t, "pgdb_migrate_lock")
	ctx := context.Background()
	pool, err := pgdb.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	cleanup := func() {
		_, _ = pool.Exec(ctx, "drop table if exists mt_crash")
		_, _ = pool.Exec(ctx, "delete from schema_history where library = 'mt-crash'")
	}
	cleanup()
	t.Cleanup(cleanup)

	// Play the part of an instance that took the migration lock and then crashed.
	holder, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var pid int
	if err := holder.QueryRow(ctx, "select pg_backend_pid()").Scan(&pid); err != nil {
		t.Fatal(err)
	}
	if _, err := holder.Exec(ctx, "select pg_advisory_lock(7263498123)"); err != nil { // same ID as migrate.go
		t.Fatal(err)
	}

	m := pgdb.Migration{Name: "mt-crash", Dir: "db", FS: fstest.MapFS{
		"db/001_crash.sql": {Data: []byte("create table mt_crash (id int)")},
	}}
	done := make(chan error, 1)
	go func() { done <- pgdb.Migrate(ctx, pool, m) }()

	select {
	case err := <-done:
		t.Fatalf("Migrate ran while the lock was held (err=%v)", err)
	case <-time.After(500 * time.Millisecond): // correctly blocked
	}

	// Kill the holder's session, as a crash or network loss would.
	if _, err := pool.Exec(ctx, "select pg_terminate_backend($1)", pid); err != nil {
		t.Fatal(err)
	}
	holder.Release()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Migrate after holder died: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Migrate still blocked after the lock holder died")
	}
}

func TestCheck(t *testing.T) {
	url := pgtest.URL(t)
	ctx := context.Background()
	pool, err := pgdb.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	if err := pgdb.Check(pool)(ctx); err != nil {
		t.Fatalf("healthy pool: %v", err)
	}
	pool.Close()
	if err := pgdb.Check(pool)(ctx); err == nil {
		t.Fatal("closed pool must fail the check")
	}
}

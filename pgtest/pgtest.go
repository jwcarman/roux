// Package pgtest gives database tests their own world. Each test package asks for
// a Postgres schema of its own, created empty on every run, so packages can run in
// parallel and truncate whatever they like without touching each other (or the
// database you run the app against).
//
// The database is TEST_DATABASE_URL when it is set (CI's Postgres service, or one you
// run yourself), or a platform's postgresql service binding (package bindings) when it is not. Otherwise each test package starts a Postgres container of its own
// (testcontainers-go) on first use, removed when the package's tests end. Without
// Docker the test fails: a database test never silently skips.
package pgtest

import (
	"context"
	"net/url"
	"os"
	"regexp"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/jwcarman/roux/bindings"
	"github.com/jwcarman/roux/pgdb"
)

var schemaName = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// Image is the Postgres the container runs, matching what apps deploy against.
const Image = "postgres:17-alpine"

var started = sync.OnceValues(func() (string, error) {
	ctx := context.Background()
	c, err := postgres.Run(ctx, Image,
		postgres.WithDatabase("roux_test"),
		postgres.WithUsername("roux"),
		postgres.WithPassword("roux"),
		postgres.BasicWaitStrategies())
	if err != nil {
		return "", err
	}
	return c.ConnectionString(ctx, "sslmode=disable")
})

// applied reads the service bindings once, before the first test asks for its database.
var applied = sync.OnceValue(bindings.Apply)

// URL is the test database's connection string: TEST_DATABASE_URL (or a postgresql service
// binding), or this test package's container, started on first use.
func URL(t *testing.T) string {
	t.Helper()
	if err := applied(); err != nil {
		t.Fatalf("pgtest: %v", err)
	}
	if raw := os.Getenv("TEST_DATABASE_URL"); raw != "" {
		return raw
	}
	raw, err := started()
	if err != nil {
		t.Fatalf("pgtest: no test database (start Docker, or set TEST_DATABASE_URL): %v", err)
	}
	return raw
}

// Pool returns a pool whose search_path is a fresh schema named schema (lower
// case, letters, digits and underscores), after dropping any left by an earlier
// run. Migrate into it as usual: pgdb.Migrate(ctx, pool, ...) records its history
// in that schema too.
func Pool(t *testing.T, schema string) *pgxpool.Pool {
	t.Helper()
	if !schemaName.MatchString(schema) {
		t.Fatalf("pgtest: schema name %q must match %s", schema, schemaName)
	}
	raw := URL(t)
	ctx := context.Background()

	admin, err := pgdb.Connect(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	for _, stmt := range []string{`drop schema if exists ` + schema + ` cascade`, `create schema ` + schema} {
		if _, err := admin.Exec(ctx, stmt); err != nil {
			t.Fatal(err)
		}
	}

	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	pool, err := pgdb.Connect(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

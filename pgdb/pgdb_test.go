package pgdb_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/pgtest"
)

func TestIsViolationLooksThroughWrapping(t *testing.T) {
	unique := fmt.Errorf("saving: %w", &pgconn.PgError{Code: pgdb.CodeUniqueViolation})
	if !pgdb.IsViolation(unique, pgdb.CodeUniqueViolation) {
		t.Error("a wrapped unique violation")
	}
	if pgdb.IsViolation(unique, pgdb.CodeForeignKeyViolation) {
		t.Error("another code")
	}
	if pgdb.IsViolation(errors.New("not postgres"), pgdb.CodeUniqueViolation) {
		t.Error("not a Postgres error")
	}
}

// A store that did not translate a database error still answers with the right status.
func TestRegisterErrorsMapsWhatAStoreLeftUntranslated(t *testing.T) {
	m := api.NewMux()
	pgdb.RegisterErrors(m)
	for i, c := range []struct {
		err    error
		status int
	}{
		{fmt.Errorf("finding: %w", pgx.ErrNoRows), http.StatusNotFound},
		{&pgconn.PgError{Code: pgdb.CodeUniqueViolation}, http.StatusConflict},
		{&pgconn.PgError{Code: pgdb.CodeForeignKeyViolation}, http.StatusConflict},
		{&pgconn.PgError{Code: "40001"}, http.StatusInternalServerError}, // anything else is a fault
	} {
		path := fmt.Sprintf("/api/fails/%d", i)
		m.Handle("GET "+path, func(http.ResponseWriter, *http.Request) error { return c.err })
		rec := httptest.NewRecorder()
		m.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if rec.Code != c.status {
			t.Errorf("%v: %d, want %d", c.err, rec.Code, c.status)
		}
	}
}

func TestConnectRefusesWhatItCannotReach(t *testing.T) {
	ctx := context.Background()
	if _, err := pgdb.Connect(ctx, "::not a url::"); err == nil || !strings.Contains(err.Error(), "parse url") {
		t.Errorf("a bad URL: %v", err)
	}
	if _, err := pgdb.Connect(ctx, "postgres://nobody:nothing@127.0.0.1:1/none?connect_timeout=1"); err == nil || !strings.Contains(err.Error(), "ping") {
		t.Errorf("nothing listening: %v", err)
	}
	pool, err := pgdb.Connect(ctx, pgtest.URL(t))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pgdb.Check(pool)(ctx); err != nil {
		t.Fatal(err)
	}
}

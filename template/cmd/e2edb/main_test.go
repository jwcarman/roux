package main

import (
	"context"
	"net/url"
	"strings"
	"testing"

	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/pgtest"
)

// A second run starts from nothing: what the last suite left is gone.
func TestFreshMakesTheDatabaseAgainEmpty(t *testing.T) {
	ctx := context.Background()
	server := pgtest.URL(t)

	made, err := fresh(ctx, server, "e2edb_fresh")
	if err != nil {
		t.Fatal(err)
	}
	if u, _ := url.Parse(made); u.Path != "/e2edb_fresh" {
		t.Fatalf("fresh gave %q, want the database e2edb_fresh on the same server", made)
	}
	pool, err := pgdb.Connect(ctx, made)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "create table left_behind (id int)"); err != nil {
		t.Fatal(err)
	}
	// The suite's server may still hold a connection when the next run starts.

	again, err := fresh(ctx, server, "e2edb_fresh")
	pool.Close()
	if err != nil {
		t.Fatal(err)
	}
	pool, err = pgdb.Connect(ctx, again)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var left bool
	if err := pool.QueryRow(ctx, "select to_regclass('left_behind') is not null").Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left {
		t.Fatal("the table from the last run is still there")
	}
}

func TestFreshKeepsTheOtherSettingsOfTheURL(t *testing.T) {
	server, err := url.Parse(pgtest.URL(t))
	if err != nil {
		t.Fatal(err)
	}
	q := server.Query()
	q.Set("application_name", "e2edb")
	server.RawQuery = q.Encode()

	made, err := fresh(context.Background(), server.String(), "e2edb_settings")
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(made)
	if u.User.String() != server.User.String() || u.Host != server.Host || u.RawQuery != server.RawQuery {
		t.Fatalf("fresh gave %q; want %q with only the database changed", made, server)
	}
}

func TestFreshSaysWhatToDoWhenPostgresIsNotThere(t *testing.T) {
	_, err := fresh(context.Background(), "postgres://app:s3cret@127.0.0.1:1/app", "app_e2e")
	if err == nil {
		t.Fatal("no error with nothing listening")
	}
	for _, want := range []string{"127.0.0.1:1", "make services", "DATABASE_URL"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not say %q", err, want)
		}
	}
	if strings.Contains(err.Error(), "s3cret") {
		t.Errorf("error %q shows the password", err)
	}
}

func TestFreshNeedsAServer(t *testing.T) {
	_, err := fresh(context.Background(), "", "app_e2e")
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL is not set") {
		t.Fatalf("error %v, want one saying DATABASE_URL is not set", err)
	}
}

// The database it is told to connect to cannot be the one it drops.
func TestFreshRefusesToDropTheDatabaseItConnectsTo(t *testing.T) {
	_, err := fresh(context.Background(), "postgres://app:app@127.0.0.1:1/app_e2e", "app_e2e")
	if err == nil || !strings.Contains(err.Error(), "another database") {
		t.Fatalf("error %v, want one asking for another database on the server", err)
	}
}

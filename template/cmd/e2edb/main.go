// Command e2edb makes the end-to-end suite's database afresh, on the Postgres server DATABASE_URL
// names, and prints that database's URL: e2e/run.sh runs it. It needs no Postgres client tools, so
// the suite runs where the services are given as addresses only.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/pgdb"
)

func main() {
	made, err := fresh(context.Background(), os.Getenv("DATABASE_URL"), "app_e2e")
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
	fmt.Println(made)
}

// fresh drops the database name on server's Postgres, connections and all, creates it empty, and
// returns server's URL naming it instead; every other part of the URL stays as it was.
func fresh(ctx context.Context, server, name string) (string, error) {
	if server == "" {
		return "", errors.New("DATABASE_URL is not set: set it to a database on the Postgres to use, or leave it to make e2e")
	}
	u, err := url.Parse(server)
	if err != nil {
		return "", fmt.Errorf("DATABASE_URL is not a URL: %w", err)
	}
	if strings.TrimPrefix(u.Path, "/") == name {
		return "", fmt.Errorf("DATABASE_URL names %s, the database this drops: name another database on the same server, such as app", name)
	}
	pool, err := pgdb.Connect(ctx, server)
	if err != nil {
		return "", fmt.Errorf("no Postgres at %s (%v): run make services for this machine's, or set DATABASE_URL to the one to use", u.Host, err)
	}
	defer pool.Close()
	quoted := pgx.Identifier{name}.Sanitize()
	for _, stmt := range []string{"drop database if exists " + quoted + " with (force)", "create database " + quoted} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			return "", fmt.Errorf("%s on %s: %w", stmt, u.Host, err)
		}
	}
	u.Path = "/" + name
	return u.String(), nil
}

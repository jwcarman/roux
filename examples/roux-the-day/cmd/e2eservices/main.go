// Command e2eservices finds the Playwright suite's services for e2e/run.sh, the way the app finds its
// own (app.LoadEnv: a variable set, then a service binding, then .env, then this machine's
// make services): it makes the database app_e2e afresh on the Postgres server DATABASE_URL names,
// checks that Mailpit answers at E2E_MAILPIT_URL, and prints both as shell assignments
// (E2E_DATABASE_URL, E2E_MAILPIT_URL). It needs no Postgres client tools and no Docker.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/pgdb"
)

func main() {
	lines, err := services(context.Background())
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
	fmt.Print(lines)
}

func services(ctx context.Context) (string, error) {
	if err := app.LoadEnv(); err != nil {
		return "", err
	}
	mailpit := app.Getenv("E2E_MAILPIT_URL", "http://localhost:8025")
	if err := inbox(mailpit); err != nil {
		return "", err
	}
	db, err := fresh(ctx, app.Getenv("DATABASE_URL", "postgres://app:app@localhost:5432/app"), "app_e2e")
	if err != nil {
		return "", err
	}
	return shellLines([][2]string{{"E2E_DATABASE_URL", db}, {"E2E_MAILPIT_URL", mailpit}}), nil
}

// inbox fails unless Mailpit's API answers at mailpit, where the suite reads the sign-in mail.
func inbox(mailpit string) error {
	client := http.Client{Timeout: 5 * time.Second}
	res, err := client.Get(strings.TrimRight(mailpit, "/") + "/api/v1/info")
	if err != nil {
		return fmt.Errorf("no Mailpit at %s (%v): run make services for this machine's, or set E2E_MAILPIT_URL (and SMTP_ADDR) to the one to use", mailpit, err)
	}
	if err := res.Body.Close(); err != nil {
		return fmt.Errorf("reading Mailpit's answer at %s: %w", mailpit, err)
	}
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s answered %s, not as Mailpit does: set E2E_MAILPIT_URL to Mailpit's web address", mailpit, res.Status)
	}
	return nil
}

// shellLines is each name=value as a line the shell reads back with eval, every value quoted.
func shellLines(pairs [][2]string) string {
	var b strings.Builder
	for _, pair := range pairs {
		fmt.Fprintf(&b, "%s='%s'\n", pair[0], strings.ReplaceAll(pair[1], "'", `'\''`))
	}
	return b.String()
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

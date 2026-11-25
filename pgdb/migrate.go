package pgdb

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"path"
	"regexp"
	"slices"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Migration is one library's (or the application's) contribution to the
// database schema. Libraries export a Migration value; the application collects
// them and passes them all to Migrate, which orders them by their declared
// dependencies: each declares a unique name plus After and Before, and the runner sorts
// them.
//
//	var Migration = pgdb.Migration{Name: "items", FS: migrations, Dir: "migrations"}
type Migration struct {
	// Name is unique across all contributors: lowercase letters and digits,
	// words joined by single '-' (e.g. "roux-users").
	Name string
	// FS and Dir locate the *.sql files, applied in lexical order (001_..., 002_...).
	FS  fs.FS
	Dir string
	// After / Before name other contributors this one must run after / before.
	// Names nobody declared are ignored (an optional dependency).
	After, Before []string
}

var namePattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Order resolves the run order: a topological sort over After/Before. When
// several migrations are ready at once they run in name order, so the result
// depends only on the declarations, never on the order they were passed in.
// Duplicate or malformed names, self-references and cycles are errors.
func Order(migs []Migration) ([]Migration, error) {
	byName, err := index(migs)
	if err != nil {
		return nil, err
	}
	g, err := graphOf(byName)
	if err != nil {
		return nil, err
	}
	return g.sort(byName)
}

// index is the migrations by name, refusing malformed and duplicate names.
func index(migs []Migration) (map[string]Migration, error) {
	byName := make(map[string]Migration, len(migs))
	for _, m := range migs {
		if !namePattern.MatchString(m.Name) {
			return nil, fmt.Errorf("pgdb: invalid migration name %q (lowercase letters and digits joined by single '-')", m.Name)
		}
		if _, dup := byName[m.Name]; dup {
			return nil, fmt.Errorf("pgdb: duplicate migration name %q", m.Name)
		}
		byName[m.Name] = m
	}
	return byName, nil
}

// graph is the run-after relation: edges[a] holds the migrations that must run after a, and
// indegree[b] counts the migrations b still waits for.
type graph struct {
	edges    map[string]map[string]bool
	indegree map[string]int
}

// add records that second runs after first, when both are migrations that exist.
func (g graph) add(first, second string) {
	_, known := g.edges[first]
	if _, alsoKnown := g.edges[second]; !known || !alsoKnown {
		return // an optional dependency, on a migration that is not there
	}
	if !g.edges[first][second] {
		g.edges[first][second] = true
		g.indegree[second]++
	}
}

// graphOf builds the graph from every After and Before naming a migration that exists (others
// are optional dependencies, ignored); a migration naming itself is an error.
func graphOf(byName map[string]Migration) (graph, error) {
	g := graph{edges: map[string]map[string]bool{}, indegree: map[string]int{}}
	for name := range byName {
		g.edges[name] = map[string]bool{}
	}
	for _, m := range byName {
		if slices.Contains(m.After, m.Name) {
			return graph{}, fmt.Errorf("pgdb: migration %q cannot run after itself", m.Name)
		}
		if slices.Contains(m.Before, m.Name) {
			return graph{}, fmt.Errorf("pgdb: migration %q cannot run before itself", m.Name)
		}
		for _, dep := range m.After {
			g.add(dep, m.Name)
		}
		for _, dep := range m.Before {
			g.add(m.Name, dep)
		}
	}
	return g, nil
}

// sort is a topological sort taking ready migrations in name order; what is left waiting is a cycle.
func (g graph) sort(byName map[string]Migration) ([]Migration, error) {
	var ready []string
	for name := range byName {
		if g.indegree[name] == 0 {
			ready = append(ready, name)
		}
	}
	out := make([]Migration, 0, len(byName))
	for len(ready) > 0 {
		sort.Strings(ready) // name-ordered tie-break
		next := ready[0]
		ready = ready[1:]
		out = append(out, byName[next])
		for after := range g.edges[next] {
			if g.indegree[after]--; g.indegree[after] == 0 {
				ready = append(ready, after)
			}
		}
	}
	if len(out) == len(byName) {
		return out, nil
	}
	var stuck []string
	for name := range byName {
		if g.indegree[name] > 0 {
			stuck = append(stuck, name)
		}
	}
	slices.Sort(stuck)
	return nil, fmt.Errorf("pgdb: migration dependency cycle among: %s", strings.Join(stuck, ", "))
}

// Migrate applies every contributor's pending *.sql files in dependency order.
// Each file runs in its own transaction and is recorded in schema_history under
// its contributor's name, so contributors never collide. A recorded file whose
// content has since changed is an error (never edit a released migration; add a
// new one). Safe to run from several instances at once (advisory lock).
func Migrate(ctx context.Context, pool *pgxpool.Pool, migs ...Migration) error {
	ordered, err := Order(migs)
	if err != nil {
		return err
	}

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	const lockID = 7263498123 // arbitrary app-wide constant
	if _, err := conn.Exec(ctx, "select pg_advisory_lock($1)", lockID); err != nil {
		return err
	}
	defer func() {
		ctx := context.WithoutCancel(ctx)
		if _, err := conn.Exec(ctx, "select pg_advisory_unlock($1)", lockID); err != nil {
			// The lock is the session's: close the connection so the pool drops it, and the lock with it.
			slog.Warn("migrations: releasing the lock failed; closing the connection", "err", err)
			_ = conn.Conn().Close(ctx)
		}
	}()

	if _, err := conn.Exec(ctx, `create table if not exists schema_history (
		library    text        not null,
		file       text        not null,
		checksum   text        not null,
		applied_at timestamptz not null default now(),
		primary key (library, file))`); err != nil {
		return err
	}

	for _, m := range ordered {
		files, err := fs.Glob(m.FS, path.Join(m.Dir, "*.sql"))
		if err != nil {
			return err
		}
		sort.Strings(files)
		for _, f := range files {
			if err := apply(ctx, conn, m, f); err != nil {
				return err
			}
		}
	}
	return nil
}

func apply(ctx context.Context, conn *pgxpool.Conn, m Migration, file string) error {
	name := path.Base(file)
	body, err := fs.ReadFile(m.FS, file)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(body)
	checksum := hex.EncodeToString(sum[:])

	var recorded string
	err = conn.QueryRow(ctx, "select checksum from schema_history where library = $1 and file = $2", m.Name, name).Scan(&recorded)
	switch {
	case err == nil:
		if recorded != checksum {
			return fmt.Errorf("pgdb: migration %s/%s was modified after it was applied; add a new migration instead", m.Name, name)
		}
		return nil
	case !errors.Is(err, pgx.ErrNoRows):
		return err
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, string(body)); err != nil {
		_ = tx.Rollback(ctx)
		return fmt.Errorf("pgdb: migration %s/%s: %w", m.Name, name, err)
	}
	if _, err := tx.Exec(ctx, "insert into schema_history (library, file, checksum) values ($1, $2, $3)", m.Name, name, checksum); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}

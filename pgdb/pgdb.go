// Package pgdb holds the kit's Postgres (pgx) building blocks: connecting,
// running embedded migrations, and mapping common database errors to problems.
package pgdb

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/problem"
)

// Postgres SQLSTATE codes we care about.
const (
	CodeUniqueViolation     = "23505"
	CodeForeignKeyViolation = "23503"
)

// Connect opens a connection pool and verifies it with a ping.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("pgdb: parse url: %w", err)
	}
	// Every query becomes a child span of the request that issued it (a no-op
	// unless telemetry is enabled). SQL text is recorded; bind parameters are not.
	cfg.ConnConfig.Tracer = otelpgx.NewTracer()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("pgdb: connect: %w", err)
	}
	if err := otelpgx.RecordStats(pool); err != nil { // pool size/wait metrics
		pool.Close()
		return nil, fmt.Errorf("pgdb: record stats: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pgdb: ping: %w", err)
	}
	return pool, nil
}

// Check returns a readiness check (see kit/health) that pings the database.
func Check(pool *pgxpool.Pool) func(ctx context.Context) error {
	return pool.Ping
}

// IsViolation reports whether err is a Postgres error with the given SQLSTATE
// code. Stores use it to turn constraint failures into their own domain errors.
func IsViolation(err error, code string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == code
}

// RegisterErrors installs fallback mappings for database errors that a store
// did not translate itself: no-rows becomes 404, unique/foreign-key violations
// become 409. Stores should still prefer returning domain errors.
func RegisterErrors(m *api.Mux) {
	m.MapError(pgx.ErrNoRows, func(error) *problem.Problem {
		return problem.NotFound("The requested resource does not exist.")
	})
	api.MapType(m, func(e *pgconn.PgError) *problem.Problem {
		switch e.Code {
		case CodeUniqueViolation:
			return problem.New(http.StatusConflict, "A resource with these values already exists.")
		case CodeForeignKeyViolation:
			return problem.New(http.StatusConflict, "The operation conflicts with a related resource.")
		}
		return nil // anything else is a genuine 500
	})
}

// Rollback rolls tx back unless it was committed: defer it straight after Begin, so a transaction
// that returns early, or panics, is undone (as a finally block would in Java). After Commit it does
// nothing; any other failure is logged, since the deferred caller has no way to return it.
func Rollback(ctx context.Context, tx pgx.Tx) {
	if err := tx.Rollback(ctx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
		slog.WarnContext(ctx, "rolling back a transaction failed", "err", err)
	}
}

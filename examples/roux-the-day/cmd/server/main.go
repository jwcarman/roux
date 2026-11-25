package main

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // zones must not depend on the machine the app runs on

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/health"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/spa"
	"github.com/jwcarman/roux/telemetry"
	web "roux-the-day/frontend"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

// stdoutHandler honors LOG_FORMAT: "json" (default, for log pipelines) or
// "text" (key=value, easier to read while developing).
func stdoutHandler() slog.Handler {
	if os.Getenv("LOG_FORMAT") == "text" {
		return slog.NewTextHandler(os.Stdout, nil)
	}
	return slog.NewJSONHandler(os.Stdout, nil)
}

// frontendFS picks the front end to serve: FRONTEND_DIR (a build on disk, for development),
// else the one built into this binary (make build), else a stand-in page.
func frontendFS() fs.FS {
	if dir := os.Getenv("FRONTEND_DIR"); dir != "" {
		slog.Info("serving the front end from disk", "dir", dir)
		return os.DirFS(dir)
	}
	if built, ok := web.Dist(); ok {
		slog.Info("serving the front end built into this binary")
		return built
	}
	slog.Warn("no front end: serving the stand-in page (set FRONTEND_DIR, or build with `make build`)")
	return spa.StandIn()
}

func run() error {
	// Stdout-only logging until telemetry is configured.
	slog.SetDefault(slog.New(telemetry.NewLogHandler(stdoutHandler())))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Telemetry first, so everything below is traced. No-op unless OTEL_* is set.
	shutdownTelemetry, err := telemetry.Setup(ctx, telemetry.Config{ServiceName: "roux-the-day"})
	if err != nil {
		return err
	}
	// Now that export is configured, also ship logs over OTLP (if enabled).
	slog.SetDefault(slog.New(telemetry.LogHandler("roux-the-day", stdoutHandler())))
	defer func() {
		flushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := shutdownTelemetry(flushCtx); err != nil {
			slog.Error("telemetry shutdown", "err", err)
		}
	}()

	appName := app.Getenv("APP_NAME", "Roux The Day")
	mux := api.NewMux()

	probes := health.New()
	probes.Register(mux)

	// DATABASE_URL selects Postgres; without it the app serves its pages but nobody can sign in.
	var pool *pgxpool.Pool
	if url := os.Getenv("DATABASE_URL"); url != "" {
		var err error
		pool, err = pgdb.Connect(ctx, url)
		if err != nil {
			return err
		}
		defer pool.Close()
		probes.Add("database", pgdb.Check(pool))
		pgdb.RegisterErrors(mux)
		slog.Info("using postgres")
	} else {
		slog.Warn("DATABASE_URL not set: nobody can sign in")
	}

	secure, err := app.SecureCookies()
	if err != nil {
		return err
	}
	kit := &app.Kit{Mux: mux, Pool: pool, AppName: appName, SecureCookies: secure}
	mods, err := modules(kit)
	if err != nil {
		return err
	}
	if err := app.Assemble(ctx, kit, mods...); err != nil {
		return err
	}

	// The front end is served from everything outside /api/. FRONTEND_DIR points at
	// a roux-web build (frontend/dist) on disk; without it, the embedded stand-in.
	if err := spa.Register(mux, spa.Config{FS: frontendFS(), Theme: kit.ShellTheme, Context: kit.Organization}); err != nil {
		return err
	}

	addr := ":8080"
	if v := os.Getenv("ADDR"); v != "" {
		addr = v
	}
	// Every connection is bounded (headers, body, answer, idle), and over HTTPS the browser is
	// told to stay on it (HSTS).
	srv := app.Server(addr, telemetry.HTTP(api.Recoverer(mux), health.LivePath, health.ReadyPath), secure)

	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	slog.Info("listening", "addr", addr)

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		slog.Info("shutting down")
		// Fail readiness first so load balancers stop routing here, give them
		// time to notice (SHUTDOWN_DELAY, e.g. "5s"), then stop accepting requests.
		probes.Draining()
		if d, err := time.ParseDuration(os.Getenv("SHUTDOWN_DELAY")); err == nil {
			time.Sleep(d)
		}
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		kit.Drain() // an email accepted a moment ago still goes out
		return nil
	}
}

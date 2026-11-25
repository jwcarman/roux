package app

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"runtime/debug"
	"syscall"
	"time"
	_ "time/tzdata" // zones must not depend on the machine the app runs on

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/health"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/spa"
	"github.com/jwcarman/roux/telemetry"
)

// Config is what an application tells Run about itself; everything else comes from the
// environment (ADDR, DATABASE_URL, APP_NAME, FRONTEND_DIR, LOG_FORMAT, SHUTDOWN_DELAY, PUBLIC_URL,
// COOKIE_SECURE, OTEL_*, and each module's own).
type Config struct {
	// Name is the service's name in traces and logs ("roux-the-day").
	Name string
	// DisplayName is the application's name on its pages and in its emails, unless APP_NAME says
	// otherwise ("Roux The Day").
	DisplayName string
	// Frontend is the front end built into the binary, if it was (the frontend package's Dist).
	// Nil, or false, serves FRONTEND_DIR or else a stand-in page.
	Frontend func() (fs.FS, bool)
	// Modules lists what the application is made of, given the kit (whose Pool is nil without a
	// database).
	Modules func(k *Kit) ([]Module, error)
}

// Main is an application's whole main: it runs the app until SIGINT or SIGTERM, and exits 1,
// logging why, if it fails.
func Main(cfg Config) {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	err := Run(ctx, cfg)
	stop()
	if err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

// Run serves the application until ctx ends: logging and telemetry, the health probes, the
// database (DATABASE_URL; a module with migrations needs it), the modules
// assembled, the front end, and a bounded server on ADDR (":8080"). When ctx ends it fails
// readiness, waits SHUTDOWN_DELAY so load balancers notice, stops taking requests, and lets the
// modules finish their work in flight.
func Run(ctx context.Context, cfg Config) error {
	slog.SetDefault(slog.New(telemetry.NewLogHandler(stdoutHandler()))) // until telemetry is set up
	shutdownTelemetry, err := telemetry.Setup(ctx, telemetry.Config{ServiceName: cfg.Name})
	if err != nil {
		return err
	}
	slog.SetDefault(slog.New(telemetry.LogHandler(cfg.Name, stdoutHandler())))
	defer func() {
		flushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := shutdownTelemetry(flushCtx); err != nil {
			slog.Error("telemetry shutdown", "err", err)
		}
	}()

	mux := api.NewMux()
	probes := health.New()
	probes.Register(mux)
	pool, err := connect(ctx, mux, probes)
	if err != nil {
		return err
	}
	if pool != nil {
		defer pool.Close()
	}
	secure, err := SecureCookies()
	if err != nil {
		return err
	}
	kit := &Kit{Mux: mux, Pool: pool, AppName: Getenv("APP_NAME", cfg.DisplayName), SecureCookies: secure}
	mods, err := cfg.Modules(kit)
	if err != nil {
		return err
	}
	if err := Assemble(ctx, kit, mods...); err != nil {
		return err
	}
	if err := spa.Register(mux, spa.Config{FS: frontendFS(cfg.Frontend), Theme: kit.ShellTheme, Context: kit.Organization}); err != nil {
		return err
	}

	delay, err := duration("SHUTDOWN_DELAY")
	if err != nil {
		return err
	}
	addr := Getenv("ADDR", ":8080")
	srv := Server(addr, telemetry.HTTP(api.Recoverer(mux), health.LivePath, health.ReadyPath), secure)
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	slog.Info(kit.AppName+" is up at "+Getenv("PUBLIC_URL", "http://localhost:8080"),
		"roux", rouxVersion(debug.ReadBuildInfo()), "go", runtime.Version(), "addr", addr)

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		slog.Info("shutting down")
		probes.Draining()
		time.Sleep(delay) // load balancers notice the failed readiness before requests stop
		// ctx is already cancelled; the shutdown keeps its values but gets ten seconds of its own.
		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		kit.Drain() // an email accepted a moment ago still goes out
		return nil
	}
}

// connect opens DATABASE_URL, adds it to the readiness probe and answers its errors. With no
// DATABASE_URL there is no pool, and a module with migrations stops startup (Assemble).
func connect(ctx context.Context, mux *api.Mux, probes *health.Health) (*pgxpool.Pool, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return nil, nil
	}
	pool, err := pgdb.Connect(ctx, url)
	if err != nil {
		return nil, err
	}
	probes.Add("database", pgdb.Check(pool))
	pgdb.RegisterErrors(mux)
	slog.Info("using postgres")
	return pool, nil
}

// stdoutHandler honors LOG_FORMAT: "json" (the default, for log pipelines) or "text" (key=value,
// easier to read while developing).
func stdoutHandler() slog.Handler {
	if os.Getenv("LOG_FORMAT") == "text" {
		return slog.NewTextHandler(os.Stdout, nil)
	}
	return slog.NewJSONHandler(os.Stdout, nil)
}

// frontendFS picks the front end to serve: FRONTEND_DIR (a build on disk, for development), else
// the one built into the binary, else a stand-in page.
func frontendFS(built func() (fs.FS, bool)) fs.FS {
	if dir := os.Getenv("FRONTEND_DIR"); dir != "" {
		slog.Info("serving the front end from disk", "dir", dir)
		return os.DirFS(dir)
	}
	if built != nil {
		if f, ok := built(); ok {
			slog.Info("serving the front end built into this binary")
			return f
		}
	}
	slog.Warn("no front end: serving the stand-in page (set FRONTEND_DIR, or build with `make build`)")
	return spa.StandIn()
}

// rouxModule is roux's Go module path, which the app's build info lists with its version.
const rouxModule = "github.com/jwcarman/roux"

// rouxVersion is the roux the binary was built with: the release (v0.4.0), "local (../)" when the
// app builds against a checkout through a replace, or "unknown" without build info.
func rouxVersion(info *debug.BuildInfo, ok bool) string {
	if !ok {
		return "unknown"
	}
	if info.Main.Path == rouxModule {
		return info.Main.Version
	}
	for _, dep := range info.Deps {
		if dep.Path != rouxModule {
			continue
		}
		if dep.Replace != nil {
			return "local (" + dep.Replace.Path + ")"
		}
		return dep.Version
	}
	return "unknown"
}

package app_test

import (
	"context"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/pgtest"
)

// freeAddr is a loopback address nothing listens on.
func freeAddr(t *testing.T) string {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	if err := l.Close(); err != nil {
		t.Fatal(err)
	}
	return addr
}

// get answers path's status and body, retrying while the server comes up.
func get(t *testing.T, addr, path string) (int, string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		req, err := http.NewRequest(http.MethodGet, "http://"+addr+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Accept", "text/html") // as a browser asks for a page
		res, err := http.DefaultClient.Do(req)
		if err == nil {
			body, _ := io.ReadAll(res.Body)
			_ = res.Body.Close()
			return res.StatusCode, string(body)
		}
		if time.Now().After(deadline) {
			t.Fatalf("GET %s: %v", path, err)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestRunServesTheAppUntilItsContextEnds(t *testing.T) {
	addr := freeAddr(t)
	t.Setenv("ADDR", addr)
	t.Setenv("DATABASE_URL", "")
	t.Setenv("FRONTEND_DIR", "")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- app.Run(ctx, app.Config{
			Name:        "acme",
			DisplayName: "Acme",
			Frontend:    func() (fs.FS, bool) { return nil, false },
			Modules: func(k *app.Kit) ([]app.Module, error) {
				return []app.Module{&mounts{fn: func(k *app.Kit) {
					k.HandlePublic("GET /api/hello", func(w http.ResponseWriter, _ *http.Request) error {
						return api.JSON(w, http.StatusOK, map[string]string{"app": k.AppName})
					})
				}}}, nil
			},
		})
	}()
	if code, _ := get(t, addr, "/api/roux/healthz"); code != 200 {
		t.Fatalf("healthz %d", code)
	}
	if code, body := get(t, addr, "/api/hello"); code != 200 || !strings.Contains(body, `"Acme"`) {
		t.Fatalf("a module's route: %d %s", code, body)
	}
	if code, body := get(t, addr, "/"); code != 200 || !strings.Contains(body, "<html") {
		t.Fatalf("the page: %d %.80s", code, body)
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run after its context ended: %v", err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("Run did not return once its context ended")
	}
}

func TestRunStopsAtAModuleThatFails(t *testing.T) {
	t.Setenv("ADDR", freeAddr(t))
	t.Setenv("DATABASE_URL", "")
	err := app.Run(context.Background(), app.Config{
		Name: "acme", DisplayName: "Acme",
		Modules: func(*app.Kit) ([]app.Module, error) { return nil, io.ErrUnexpectedEOF },
	})
	if err == nil || !strings.Contains(err.Error(), io.ErrUnexpectedEOF.Error()) {
		t.Fatalf("err = %v", err)
	}
}

// runApp runs the app until the test ends, and answers its address.
func runApp(t *testing.T, cfg app.Config) string {
	t.Helper()
	addr := freeAddr(t)
	t.Setenv("ADDR", addr)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- app.Run(ctx, cfg) }()
	t.Cleanup(func() {
		cancel()
		if err := <-done; err != nil {
			t.Errorf("Run after its context ended: %v", err)
		}
	})
	return addr
}

// shell is an index.html with every placeholder spa fills, and the words to find.
func shell(words string) string {
	return `<html><title>__APP_NAME__</title><script nonce="__CSP_NONCE__">__APP_THEME__ __APP_CONTEXT__</script>` + words + `</html>`
}

func noModules(*app.Kit) ([]app.Module, error) { return nil, nil }

func TestRunWithADatabaseReportsItInReadiness(t *testing.T) {
	t.Setenv("DATABASE_URL", pgtest.URL(t))
	t.Setenv("FRONTEND_DIR", "")
	t.Setenv("LOG_FORMAT", "text")
	t.Setenv("SHUTDOWN_DELAY", "1ms")

	addr := runApp(t, app.Config{Name: "acme", DisplayName: "Acme", Modules: noModules})

	if code, body := get(t, addr, "/api/roux/readyz"); code != 200 || !strings.Contains(body, "database") {
		t.Fatalf("readyz %d %s", code, body)
	}
}

func TestRunServesTheFrontEndFromDiskOrFromTheBinary(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(shell("from disk")), 0o600); err != nil {
		t.Fatal(err)
	}
	built := func() (fs.FS, bool) {
		return fstest.MapFS{"index.html": {Data: []byte(shell("built in"))}}, true
	}

	t.Run("FRONTEND_DIR wins", func(t *testing.T) {
		t.Setenv("FRONTEND_DIR", dir)
		addr := runApp(t, app.Config{Name: "acme", DisplayName: "Acme", Frontend: built, Modules: noModules})
		if code, body := get(t, addr, "/"); code != 200 || !strings.Contains(body, "from disk") {
			t.Fatalf("%d %.120s", code, body)
		}
	})
	t.Run("else the built-in one", func(t *testing.T) {
		t.Setenv("FRONTEND_DIR", "")
		addr := runApp(t, app.Config{Name: "acme", DisplayName: "Acme", Frontend: built, Modules: noModules})
		if code, body := get(t, addr, "/"); code != 200 || !strings.Contains(body, "built in") {
			t.Fatalf("%d %.120s", code, body)
		}
	})
}

func TestRunRefusesSettingsItCannotUse(t *testing.T) {
	t.Setenv("ADDR", freeAddr(t))
	cfg := app.Config{Name: "acme", DisplayName: "Acme", Modules: noModules}

	t.Setenv("DATABASE_URL", "not a url")
	if err := app.Run(context.Background(), cfg); err == nil || !strings.Contains(err.Error(), "pgdb") {
		t.Fatalf("a bad DATABASE_URL: %v", err)
	}

	t.Setenv("DATABASE_URL", "")
	t.Setenv("COOKIE_SECURE", "maybe")
	if err := app.Run(context.Background(), cfg); err == nil || !strings.Contains(err.Error(), "COOKIE_SECURE") {
		t.Fatalf("a bad COOKIE_SECURE: %v", err)
	}

	t.Setenv("COOKIE_SECURE", "")
	t.Setenv("SHUTDOWN_DELAY", "30")
	if err := app.Run(context.Background(), cfg); err == nil || !strings.Contains(err.Error(), "SHUTDOWN_DELAY") {
		t.Fatalf("a SHUTDOWN_DELAY without a unit: %v", err)
	}

	t.Setenv("SHUTDOWN_DELAY", "")
	t.Setenv("TRACE_TRUST_INBOUND", "1")
	if err := app.Run(context.Background(), cfg); err == nil || !strings.Contains(err.Error(), "TRACE_TRUST_INBOUND must be true or false") {
		t.Fatalf("a TRACE_TRUST_INBOUND of 1: %v", err)
	}
}

package app_test

import (
	"context"
	"io"
	"io/fs"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
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

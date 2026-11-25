package app_test

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
)

// routes mounts one route of each kind on a kit, and returns the env serving them.
func routes(t *testing.T) *authntest.Env {
	env := authntest.New(t, "app_routes")
	k := &app.Kit{Mux: env.Mux, Host: env.Host}
	answer := func(w http.ResponseWriter, r *http.Request) error {
		who := "nobody"
		if authn.PrincipalFrom(r.Context()) != nil {
			who = "someone"
		}
		return api.JSON(w, http.StatusOK, map[string]string{"who": who})
	}
	k.Handle("POST /api/notes", "notes.write", answer)
	k.HandleSignedIn("GET /api/me/notes", answer)
	k.HandlePublic("POST /api/hello", answer)
	return env.Serve()
}

func TestAKitRouteNeedsItsPermissionASignInAndTheCSRFToken(t *testing.T) {
	env := routes(t)
	env.Browser().Post("/api/notes", nil).Want(t, http.StatusUnauthorized, "anonymous")
	env.SignedIn(env.Identity()).Post("/api/notes", nil).Want(t, http.StatusForbidden, "without notes.write")
	writer := env.SignedIn(env.Identity("notes.write"))
	writer.Do("POST", "/api/notes", nil, false).Want(t, http.StatusForbidden, "without the CSRF token")
	if got := writer.Post("/api/notes", nil).Want(t, http.StatusOK, "a writer").JSON(t)["who"]; got != "someone" {
		t.Errorf("the handler saw %v, want the caller", got)
	}
}

func TestASignedInRouteNeedsOnlyASignIn(t *testing.T) {
	env := routes(t)
	env.Browser().Get("/api/me/notes").Want(t, http.StatusUnauthorized, "anonymous")
	env.SignedIn(env.Identity()).Get("/api/me/notes").Want(t, http.StatusOK, "anyone signed in")
}

func TestAPublicRouteIsOpenToAnyoneButStillChecksCSRF(t *testing.T) {
	env := routes(t)
	browser := env.Browser()
	browser.Get("/api/roux/auth/me") // any response issues the CSRF cookie
	browser.Do("POST", "/api/hello", nil, false).Want(t, http.StatusForbidden, "without the CSRF token")
	if got := browser.Post("/api/hello", nil).Want(t, http.StatusOK, "anonymous").JSON(t)["who"]; got != "nobody" {
		t.Errorf("the handler saw %v, want nobody", got)
	}
}

func TestAKitRouteMustNameAPermission(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("Handle with no permission did not panic; HandleSignedIn says that")
		}
	}()
	k := &app.Kit{Mux: api.NewMux()}
	k.Handle("GET /api/notes", "", func(http.ResponseWriter, *http.Request) error { return nil })
}

func TestAssemblyWarnsOfARouteNoGuardWraps(t *testing.T) {
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })
	k := &app.Kit{Mux: api.NewMux(), AppName: "Acme"}
	err := app.Assemble(context.Background(), k, &mounts{fn: func(k *app.Kit) {
		k.Mux.Handle("POST /api/open", func(http.ResponseWriter, *http.Request) error { return nil })
		k.Handle("POST /api/notes", "notes.write", func(http.ResponseWriter, *http.Request) error { return nil })
	}})
	if err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	if !strings.Contains(out, "route has no guard") || !strings.Contains(out, `route="POST /api/open"`) || strings.Contains(out, "/api/notes") {
		t.Fatalf("log:\n%s", out)
	}
}

// mounts is a module whose Mount runs fn.
type mounts struct{ fn func(*app.Kit) }

func (*mounts) Name() string { return "mounts" }
func (m *mounts) Mount(_ context.Context, k *app.Kit) error {
	m.fn(k)
	return nil
}

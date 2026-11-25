package app_test

import (
	"net/http"
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

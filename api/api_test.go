package api_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/apperr"
	"github.com/jwcarman/roux/problem"
)

type libErr struct{ Code int }

func (e *libErr) Error() string { return "lib error " + strconv.Itoa(e.Code) }

type selfErr struct{}

func (selfErr) Error() string { return "self" }
func (selfErr) Problem() *problem.Problem {
	return problem.New(http.StatusTeapot, "self-described")
}

func status(t *testing.T, m *api.Mux, err error) int {
	t.Helper()
	m.Handle("GET /api/x", func(http.ResponseWriter, *http.Request) error { return err })
	rec := httptest.NewRecorder()
	m.ServeHTTP(rec, httptest.NewRequest("GET", "/api/x", nil))
	return rec.Code
}

func TestErrorResolution(t *testing.T) {
	sentinel := errors.New("custom sentinel")

	tests := []struct {
		name  string
		setup func(*api.Mux)
		err   error
		want  int
	}{
		{"default sentinel", nil, apperr.ErrNotFound, 404},
		{"wrapped default", nil, fmt.Errorf("ctx: %w", apperr.ErrConflict), 409},
		{"all defaults", nil, apperr.ErrForbidden, 403},
		{"embedded problem", nil, fmt.Errorf("ctx: %w", problem.BadRequest("x")), 400},
		{"problem source", nil, fmt.Errorf("ctx: %w", selfErr{}), 418},
		{"unmapped is 500", nil, errors.New("boom"), 500},
		{"custom sentinel", func(m *api.Mux) {
			m.MapError(sentinel, func(error) *problem.Problem { return problem.New(402, "") })
		}, sentinel, 402},
		{"type mapping", func(m *api.Mux) {
			api.MapType(m, func(e *libErr) *problem.Problem { return problem.New(e.Code, "") })
		}, fmt.Errorf("ctx: %w", &libErr{Code: 503}), 503},
		{"type mapping declines", func(m *api.Mux) {
			api.MapType(m, func(e *libErr) *problem.Problem { return nil })
		}, &libErr{Code: 1}, 500},
		{"later mapping overrides default", func(m *api.Mux) {
			m.MapError(apperr.ErrNotFound, func(error) *problem.Problem { return problem.New(410, "") })
		}, apperr.ErrNotFound, 410},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := api.NewMux()
			if tt.setup != nil {
				tt.setup(m)
			}
			if got := status(t, m, tt.err); got != tt.want {
				t.Fatalf("status = %d, want %d", got, tt.want)
			}
		})
	}
}

func okHandler(w http.ResponseWriter, r *http.Request) error { return api.JSON(w, 200, "ok") }

func mustPanic(t *testing.T, wantSubstr string, f func()) {
	t.Helper()
	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected a panic")
		}
		if msg, _ := r.(string); !strings.Contains(msg, wantSubstr) {
			t.Fatalf("panic = %v, want containing %q", r, wantSubstr)
		}
	}()
	f()
}

func TestRoutesMustLiveUnderAPI(t *testing.T) {
	m := api.NewMux()
	mustPanic(t, "must be under /api/", func() { m.Handle("GET /items", okHandler) })
	mustPanic(t, "must be under /api/", func() { m.Handle("GET /apix/items", okHandler) })
	mustPanic(t, `form "METHOD /path"`, func() { m.Handle("/api/items", okHandler) })
	mustPanic(t, `form "METHOD /path"`, func() { m.Handle("GET api/items", okHandler) })
	m.Handle("GET /api/items", okHandler) // fine
}

func TestRouxPrefixIsReservedForTheKit(t *testing.T) {
	m := api.NewMux()
	mustPanic(t, "reserved for the kit", func() { m.Handle("GET /api/roux/anything", okHandler) })
	mustPanic(t, "reserved for the kit", func() { m.Handle("GET /api/roux", okHandler) })
	m.Handle("GET /api/rouxish", okHandler) // a different segment, not reserved
}

func TestHandleRouxMountsUnderAPIRoux(t *testing.T) {
	m := api.NewMux()
	m.HandleRoux("GET /thing", okHandler)
	get := func(path string) int {
		rec := httptest.NewRecorder()
		m.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		return rec.Code
	}
	if get("/api/roux/thing") != 200 {
		t.Fatal("/api/roux/thing should be served")
	}
	if get("/thing") != 404 || get("/api/thing") != 404 {
		t.Fatal("kit route must exist only under /api/roux")
	}
}

func TestFallbackServesOnlyOutsideAPI(t *testing.T) {
	m := api.NewMux()
	m.Handle("GET /api/x", okHandler)
	m.Fallback(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("fallback")) }))
	get := func(path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		m.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		return rec
	}
	if got := get("/anything/at/all").Body.String(); got != "fallback" {
		t.Fatalf("outside /api: %q", got)
	}
	for _, p := range []string{"/api/unknown", "/api"} {
		if rec := get(p); rec.Code != 404 || rec.Header().Get("Content-Type") != "application/problem+json" {
			t.Fatalf("%s must be a problem 404, got %d %s", p, rec.Code, rec.Header().Get("Content-Type"))
		}
	}
	if get("/apix").Body.String() != "fallback" {
		t.Fatal("/apix is not under /api/")
	}
	mustPanic(t, "already set", func() { m.Fallback(http.NotFoundHandler()) })
}

func TestKitMountsUnderItsBaseWithItsOwnErrors(t *testing.T) {
	m := api.NewMux()
	custom := func(w http.ResponseWriter, r *http.Request, p *problem.Problem) {
		w.Header().Set("X-Custom", strconv.Itoa(p.Status))
		w.WriteHeader(p.Status)
	}
	kit := m.Kit("/kitbase", custom)
	kit.Handle("GET /thing", okHandler)
	kit.Handle("GET /fail", func(http.ResponseWriter, *http.Request) error { return apperr.ErrConflict })
	m.Fallback(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("fallback")) }))

	get := func(method, path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		m.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
		return rec
	}
	if get("GET", "/kitbase/thing").Code != 200 {
		t.Fatal("kit route should be served at its base")
	}
	// Handler errors, unknown paths and wrong methods all use the kit's renderer.
	for _, c := range []struct{ method, path, want string }{
		{"GET", "/kitbase/fail", "409"},
		{"GET", "/kitbase/unknown", "404"},
		{"POST", "/kitbase/thing", "405"},
		{"GET", "/kitbase", "404"},
	} {
		if got := get(c.method, c.path).Header().Get("X-Custom"); got != c.want {
			t.Errorf("%s %s: custom renderer saw %q, want %s", c.method, c.path, got, c.want)
		}
	}
	// The front-end fallback never serves a kit's base path, but serves the rest.
	if get("GET", "/kitbase/unknown").Body.String() == "fallback" {
		t.Fatal("fallback must not serve a kit's base")
	}
	if get("GET", "/kitbasex").Body.String() != "fallback" {
		t.Fatal("/kitbasex is not under /kitbase")
	}
}

func TestKitPrefixRules(t *testing.T) {
	m := api.NewMux()
	render := func(http.ResponseWriter, *http.Request, *problem.Problem) {}
	for _, bad := range []string{"kit", "/", "/kit/", "/api/mine"} {
		mustPanic(t, "kit base", func() { m.Kit(bad, render) })
	}
	m.Kit("/who", render)
	mustPanic(t, "overlaps", func() { m.Kit("/who", render) })
	mustPanic(t, "overlaps", func() { m.Kit("/who/sub", render) })
	m.Kit("/whoever", render) // a different segment, not an overlap
}

func TestUnexpectedErrorsAreOpaqueWithAnErrorID(t *testing.T) {
	m := api.NewMux()
	m.Handle("GET /api/boom", func(http.ResponseWriter, *http.Request) error { return errors.New("password=hunter2 refused") })
	rec := httptest.NewRecorder()
	m.ServeHTTP(rec, httptest.NewRequest("GET", "/api/boom", nil))
	var p problem.Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 500 || p.Detail != "Something went wrong" || len(p.ErrorID) != 36 {
		t.Fatalf("%d %+v", rec.Code, p)
	}
	if strings.Contains(rec.Body.String(), "hunter2") {
		t.Fatalf("the cause leaked: %s", rec.Body)
	}
}

func TestValidationIsRouxs400WithSortedFieldErrors(t *testing.T) {
	p := problem.Validation(
		problem.Violation{Field: "name", Message: "Must not be blank"},
		problem.Violation{Field: "email", Message: problem.ValidEmail},
		problem.Violation{Field: "name", Message: "Another"},
	)
	if p.Status != 400 || p.Detail != "The request has invalid fields" {
		t.Fatalf("%+v", p)
	}
	got := []string{}
	for _, e := range p.Errors {
		got = append(got, e.Field+": "+e.Message)
	}
	want := []string{"email: Must be a valid email address", "name: Another", "name: Must not be blank"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("errors = %v, want %v", got, want)
	}
	if problem.MustBeOneOf("A", "B") != "Must be one of A, B" || problem.MustBeBetween(1, 80) != "Must be between 1 and 80 characters" {
		t.Fatal("message helpers")
	}
}

package authn

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/problem"
)

func TestCodesFromStatus(t *testing.T) {
	cases := map[int]string{
		400: "invalid-request", 401: "unauthorized", 403: "forbidden", 404: "not-found",
		405: "method-not-allowed", 406: "not-acceptable", 415: "unsupported-media-type",
		500: "server-error", 503: "server-error", 409: "error", 418: "error",
	}
	for status, want := range cases {
		if got := codeFor(problem.New(status, "x")); got != want {
			t.Errorf("status %d: code %q, want %q", status, got, want)
		}
	}
	// A problem's own code wins over its status.
	if got := codeFor(withCode(409, "last-admin", "x")); got != "last-admin" {
		t.Fatalf("own code: %q", got)
	}
}

func TestServerErrorsHaveNullDetailAndNeverLeak(t *testing.T) {
	mux := api.NewMux()
	kit := mux.Kit("/api/roux/auth", render)
	kit.Handle("GET /boom", func(http.ResponseWriter, *http.Request) error {
		return errors.New("password=hunter2 refused by db")
	})
	kit.Handle("GET /teapot", func(http.ResponseWriter, *http.Request) error {
		return problem.New(http.StatusInternalServerError, "secret detail")
	})
	kit.Handle("GET /conflict", func(http.ResponseWriter, *http.Request) error {
		return withCode(http.StatusConflict, "last-credential", "That is your last way to sign in")
	})

	get := func(path string) (*httptest.ResponseRecorder, map[string]any) {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		var m map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &m)
		return rec, m
	}

	for _, path := range []string{"/api/roux/auth/boom", "/api/roux/auth/teapot"} {
		rec, body := get(path)
		detail, present := body["detail"]
		if rec.Code != 500 || rec.Header().Get("Roux-Error") != "server-error" || !present || detail != nil {
			t.Fatalf("%s: %d %v (detail must be present and null)", path, rec.Code, body)
		}
		if bytes := rec.Body.String(); contains(bytes, "hunter2") || contains(bytes, "secret detail") {
			t.Fatalf("%s leaked: %s", path, bytes)
		}
	}

	rec, body := get("/api/roux/auth/conflict")
	if rec.Code != 409 || body["code"] != "last-credential" || body["type"] != "urn:roux:error:last-credential" ||
		body["detail"] != "That is your last way to sign in" || rec.Header().Get("Roux-Error") != "last-credential" {
		t.Fatalf("own-code problem: %d %v", rec.Code, body)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

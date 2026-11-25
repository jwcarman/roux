package app_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jwcarman/roux/app"
)

func TestTheServerBoundsEveryConnection(t *testing.T) {
	srv := app.Server(":0", http.NotFoundHandler(), false)
	if srv.ReadHeaderTimeout != 10*time.Second || srv.ReadTimeout != 30*time.Second ||
		srv.WriteTimeout != 60*time.Second || srv.IdleTimeout != 120*time.Second {
		t.Fatalf("timeouts: header %v, read %v, write %v, idle %v",
			srv.ReadHeaderTimeout, srv.ReadTimeout, srv.WriteTimeout, srv.IdleTimeout)
	}
}

func TestAServerOverHTTPSAsksForHTTPSFromThenOn(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	for secure, want := range map[bool]string{true: "max-age=31536000", false: ""} {
		rec := httptest.NewRecorder()
		app.Server(":0", ok, secure).Handler.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
		if got := rec.Header().Get("Strict-Transport-Security"); got != want {
			t.Errorf("secure %v: HSTS %q, want %q", secure, got, want)
		}
	}
}

package health_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/health"
)

type report struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}

func get(t *testing.T, h *health.Health, path string) (int, report, string) {
	t.Helper()
	mux := api.NewMux()
	h.Register(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
	var r report
	if err := json.Unmarshal(rec.Body.Bytes(), &r); err != nil {
		t.Fatalf("body %q: %v", rec.Body, err)
	}
	return rec.Code, r, rec.Body.String()
}

func TestLivenessIgnoresChecks(t *testing.T) {
	h := health.New()
	h.Add("database", func(context.Context) error { return errors.New("down") })
	if code, r, _ := get(t, h, health.LivePath); code != 200 || r.Status != "UP" {
		t.Fatalf("liveness = %d %+v; a failing dependency must not fail liveness", code, r)
	}
}

func TestReadinessNoChecks(t *testing.T) {
	if code, r, _ := get(t, health.New(), health.ReadyPath); code != 200 || r.Status != "UP" {
		t.Fatalf("%d %+v", code, r)
	}
}

func TestReadinessAggregatesChecks(t *testing.T) {
	ok := func(context.Context) error { return nil }
	fail := func(context.Context) error { return errors.New("password=hunter2 refused") }

	h := health.New()
	h.Add("database", ok)
	h.Add("cache", ok)
	code, r, _ := get(t, h, health.ReadyPath)
	if code != 200 || r.Status != "UP" || r.Checks["database"] != "UP" || r.Checks["cache"] != "UP" {
		t.Fatalf("all up: %d %+v", code, r)
	}

	h.Add("broker", fail)
	code, r, body := get(t, h, health.ReadyPath)
	if code != 503 || r.Status != "DOWN" || r.Checks["broker"] != "DOWN" || r.Checks["database"] != "UP" {
		t.Fatalf("one down: %d %+v", code, r)
	}
	if strings.Contains(body, "hunter2") {
		t.Fatalf("error details leaked: %s", body)
	}
}

func TestSlowCheckTimesOut(t *testing.T) {
	h := health.New()
	h.Add("slow", func(ctx context.Context) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(30 * time.Second):
			return nil
		}
	})
	start := time.Now()
	code, r, _ := get(t, h, health.ReadyPath)
	if code != 503 || r.Checks["slow"] != "DOWN" {
		t.Fatalf("%d %+v", code, r)
	}
	if d := time.Since(start); d > 5*time.Second {
		t.Fatalf("took %v; the check timeout was not applied", d)
	}
}

func TestChecksRunConcurrently(t *testing.T) {
	h := health.New()
	pause := func(context.Context) error { time.Sleep(400 * time.Millisecond); return nil }
	h.Add("a", pause)
	h.Add("b", pause)
	h.Add("c", pause)
	start := time.Now()
	get(t, h, health.ReadyPath)
	if d := time.Since(start); d > 900*time.Millisecond {
		t.Fatalf("took %v; checks look sequential", d)
	}
}

func TestDrainingFailsReadinessOnly(t *testing.T) {
	h := health.New()
	h.Add("database", func(context.Context) error { return nil })
	h.Draining()
	if code, r, _ := get(t, h, health.ReadyPath); code != http.StatusServiceUnavailable || r.Status != "DOWN" {
		t.Fatalf("readiness while draining: %d %+v", code, r)
	}
	if code, _, _ := get(t, h, health.LivePath); code != 200 {
		t.Fatalf("liveness while draining = %d, want 200", code)
	}
}

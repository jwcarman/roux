// Package health provides the kit's standard probe endpoints:
//
//	GET /api/roux/healthz  liveness:  200 while the process can serve requests. It checks
//	              nothing external, so a database outage never gets the pod restarted.
//	GET /api/roux/readyz   readiness: 200 only if every registered check passes and the
//	              service is not shutting down; otherwise 503 (stop sending traffic).
//
// Bodies are {"status":"UP","checks":{"database":"UP"}}. Failure details are logged, never
// returned, so the (usually unauthenticated) endpoint can't leak internals.
package health

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jwcarman/roux/api"
)

const (
	// Full paths (under the kit's reserved /api/roux prefix).
	LivePath  = api.RouxPrefix + "healthz"
	ReadyPath = api.RouxPrefix + "readyz"

	up   = "UP"
	down = "DOWN"
)

// Check reports whether one dependency is usable; a non-nil error means DOWN.
// Checks must honor ctx cancellation (they are given a timeout).
type Check func(ctx context.Context) error

// Health holds the readiness checks. Create with New; it is safe for
// concurrent use, but Add checks before serving traffic.
type Health struct {
	timeout  time.Duration
	names    []string
	checks   []Check
	draining atomic.Bool
}

// New returns a Health whose checks each get a 2 second timeout.
func New() *Health { return &Health{timeout: 2 * time.Second} }

// Add registers a named readiness check, e.g. h.Add("database", pgdb.Check(pool)).
func (h *Health) Add(name string, c Check) {
	h.names = append(h.names, name)
	h.checks = append(h.checks, c)
}

// Draining marks the service as shutting down: /api/roux/readyz returns 503 from now
// on while /api/roux/healthz stays 200, so load balancers drain traffic before the server
// stops accepting connections.
func (h *Health) Draining() { h.draining.Store(true) }

// Register mounts the probes (LivePath and ReadyPath) on mux.
func (h *Health) Register(mux *api.Mux) {
	mux.HandleRoux("GET /api/roux/healthz", h.live)
	mux.HandleRoux("GET /api/roux/readyz", h.ready)
}

type report struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks,omitempty"`
}

func (h *Health) live(w http.ResponseWriter, r *http.Request) error {
	return api.JSON(w, http.StatusOK, report{Status: up})
}

func (h *Health) ready(w http.ResponseWriter, r *http.Request) error {
	if h.draining.Load() {
		return api.JSON(w, http.StatusServiceUnavailable, report{Status: down})
	}

	results := make([]string, len(h.checks))
	var wg sync.WaitGroup
	for i, check := range h.checks {
		wg.Add(1)
		go func() { // Go 1.22+: i and check are per-iteration
			defer wg.Done()
			ctx, cancel := context.WithTimeout(r.Context(), h.timeout)
			defer cancel()
			if err := check(ctx); err != nil {
				slog.WarnContext(r.Context(), "readiness check failed", "check", h.names[i], "err", err)
				results[i] = down
				return
			}
			results[i] = up
		}()
	}
	wg.Wait()

	rep := report{Status: up}
	if len(results) > 0 {
		rep.Checks = make(map[string]string, len(results))
	}
	status := http.StatusOK
	for i, res := range results {
		rep.Checks[h.names[i]] = res
		if res == down {
			rep.Status, status = down, http.StatusServiceUnavailable
		}
	}
	return api.JSON(w, status, rep)
}

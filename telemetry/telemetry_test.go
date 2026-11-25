package telemetry_test

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/apperr"
	"github.com/jwcarman/roux/problem"
	"github.com/jwcarman/roux/telemetry"
)

// harness builds a traced app and returns it with the recorder that captures spans.
func harness(t *testing.T) (http.Handler, *tracetest.SpanRecorder) {
	t.Helper()
	rec := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(rec))
	prev := otel.GetTracerProvider()
	otel.SetTracerProvider(tp) // otelhttp reads the global provider when the handler is built
	t.Cleanup(func() { otel.SetTracerProvider(prev) })

	mux := api.NewMux()
	mux.Handle("GET /api/things/{id}", func(w http.ResponseWriter, r *http.Request) error {
		if r.PathValue("id") == "9" {
			return apperr.ErrNotFound
		}
		if r.PathValue("id") == "500" {
			return errors.New("db exploded")
		}
		return api.JSON(w, 200, map[string]string{"ok": "yes"})
	})
	mux.Handle("GET /api/panic", func(http.ResponseWriter, *http.Request) error { panic("kaboom") })
	return telemetry.HTTP(api.Recoverer(mux)), rec
}

func serve(h http.Handler, method, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(method, path, nil))
	return w
}

func only(t *testing.T, rec *tracetest.SpanRecorder) sdktrace.ReadOnlySpan {
	t.Helper()
	spans := rec.Ended()
	if len(spans) != 1 {
		t.Fatalf("got %d spans, want 1", len(spans))
	}
	return spans[0]
}

func attr(s sdktrace.ReadOnlySpan, key string) string {
	for _, a := range s.Attributes() {
		if string(a.Key) == key {
			return a.Value.String()
		}
	}
	return ""
}

func TestSpanNamedAfterRoute(t *testing.T) {
	h, rec := harness(t)
	serve(h, "GET", "/api/things/123")
	span := only(t, rec)
	// Low-cardinality: the route template, never the concrete path.
	if span.Name() != "GET /api/things/{id}" || attr(span, "http.route") != "/api/things/{id}" {
		t.Fatalf("name=%q route=%q", span.Name(), attr(span, "http.route"))
	}
	if span.Status().Code == codes.Error {
		t.Fatal("2xx must not be an error span")
	}
}

func TestUnmatchedRouteHasBoundedName(t *testing.T) {
	h, rec := harness(t)
	w := serve(h, "GET", "/no/such/path/12345")
	if w.Code != 404 {
		t.Fatalf("status %d", w.Code)
	}
	if name := only(t, rec).Name(); name != "GET" {
		t.Fatalf("span name %q should not include the raw path", name)
	}
}

func TestProblemCarriesTraceID(t *testing.T) {
	h, rec := harness(t)
	w := serve(h, "GET", "/api/things/9")
	var p problem.Problem
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	span := only(t, rec)
	if p.Status != 404 || p.TraceID == "" || p.TraceID != span.SpanContext().TraceID().String() {
		t.Fatalf("problem %+v vs trace %s", p, span.SpanContext().TraceID())
	}
	if span.Status().Code == codes.Error {
		t.Fatal("a 404 is a client error, not a trace error")
	}
}

func TestServerFaultsAreRecordedOnTheSpan(t *testing.T) {
	for _, path := range []string{"/api/things/500", "/api/panic"} {
		t.Run(path, func(t *testing.T) {
			h, rec := harness(t)
			w := serve(h, "GET", path)
			if w.Code != 500 {
				t.Fatalf("status %d", w.Code)
			}
			if body := w.Body.String(); strings.Contains(body, "exploded") || strings.Contains(body, "kaboom") {
				t.Fatalf("leaked: %s", w.Body)
			}
			span := only(t, rec)
			if span.Status().Code != codes.Error {
				t.Fatalf("status = %v", span.Status())
			}
			if !slices.ContainsFunc(span.Events(), func(e sdktrace.Event) bool { return e.Name == "exception" }) {
				t.Fatal("error not recorded as an exception event")
			}
		})
	}
}

func TestIgnoredPathsAreNotTraced(t *testing.T) {
	_, rec := harness(t)
	// Rebuild with an ignore list over the same app, as main does for probes.
	mux := api.NewMux()
	mux.HandleRoux("GET /api/roux/healthz", func(w http.ResponseWriter, r *http.Request) error { return api.JSON(w, 200, "ok") })
	mux.Handle("GET /api/things/{id}", func(w http.ResponseWriter, r *http.Request) error { return api.JSON(w, 200, "ok") })
	h := telemetry.HTTP(api.Recoverer(mux), "/api/roux/healthz")

	serve(h, "GET", "/api/roux/healthz")
	if n := len(rec.Ended()); n != 0 {
		t.Fatalf("probe produced %d spans", n)
	}
	serve(h, "GET", "/api/things/1")
	if n := len(rec.Ended()); n != 1 {
		t.Fatalf("normal request produced %d spans, want 1", n)
	}
}

func TestIncomingTraceContextIsContinued(t *testing.T) {
	h, rec := harness(t)
	otel.SetTextMapPropagator(propagationW3C())
	req := httptest.NewRequest("GET", "/api/things/1", nil)
	req.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	h.ServeHTTP(httptest.NewRecorder(), req)
	if got := only(t, rec).SpanContext().TraceID().String(); got != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Fatalf("trace id %s: upstream context was not continued", got)
	}
}

func TestLogRecordsCarryTraceIDs(t *testing.T) {
	_, rec := harness(t)
	_ = rec
	var buf strings.Builder
	log := slog.New(telemetry.NewLogHandler(slog.NewJSONHandler(&buf, nil)))

	tp := otel.GetTracerProvider()
	ctx, span := tp.Tracer("t").Start(t.Context(), "op")
	log.InfoContext(ctx, "inside")
	span.End()
	log.Info("outside")

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if !strings.Contains(lines[0], `"trace_id":"`+span.SpanContext().TraceID().String()+`"`) {
		t.Fatalf("missing trace_id: %s", lines[0])
	}
	if strings.Contains(lines[1], "trace_id") {
		t.Fatalf("unexpected trace_id without a span: %s", lines[1])
	}
	_ = attribute.Key("")
}

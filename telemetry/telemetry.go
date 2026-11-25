// Package telemetry wires OpenTelemetry (traces and metrics) into a service.
//
// Configuration uses the standard OTEL_* environment variables, so deployment
// tooling needs nothing app-specific:
//
//	OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   # enables export
//	OTEL_SERVICE_NAME=orders                            # overrides Config.ServiceName
//	OTEL_TRACES_EXPORTER / OTEL_METRICS_EXPORTER / OTEL_LOGS_EXPORTER
//	                                                    # otlp (default), console, none
//	OTEL_TRACES_SAMPLER / OTEL_TRACES_SAMPLER_ARG
//	OTEL_SDK_DISABLED=true                              # force off
//
// With none of these set, telemetry is a no-op (instrumentation stays in the
// code and costs almost nothing). Trace context is propagated either way.
package telemetry

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync/atomic"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/contrib/exporters/autoexport"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
	"go.opentelemetry.io/otel/trace"
)

// Config identifies the service. Everything else comes from OTEL_* variables.
type Config struct {
	ServiceName    string // default for service.name (OTEL_SERVICE_NAME wins)
	ServiceVersion string
}

// Setup installs global tracer/meter providers and the W3C propagators. Call
// the returned shutdown function on exit to flush buffered telemetry.
func Setup(ctx context.Context, cfg Config) (shutdown func(context.Context) error, err error) {
	// Always propagate trace context, even when not exporting.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{}, propagation.Baggage{}))

	if !enabled() {
		slog.Info("telemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)")
		return func(context.Context) error { return nil }, nil
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(cfg.ServiceVersion)),
		resource.WithFromEnv(), // OTEL_SERVICE_NAME, OTEL_RESOURCE_ATTRIBUTES override the above
		resource.WithTelemetrySDK(),
		resource.WithHost(),
		resource.WithProcessPID(),
	)
	if err != nil {
		return nil, err
	}

	spanExp, err := autoexport.NewSpanExporter(ctx)
	if err != nil {
		return nil, err
	}
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(spanExp), sdktrace.WithResource(res))

	reader, err := autoexport.NewMetricReader(ctx)
	if err != nil {
		return nil, err
	}
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader), sdkmetric.WithResource(res))

	otel.SetTracerProvider(tp)
	otel.SetMeterProvider(mp)

	// Logs are exported over OTLP too, unless OTEL_LOGS_EXPORTER=none (use that
	// when the platform already collects stdout, to avoid duplicate lines).
	var lp *sdklog.LoggerProvider
	if !strings.EqualFold(os.Getenv("OTEL_LOGS_EXPORTER"), "none") {
		logExp, err := autoexport.NewLogExporter(ctx)
		if err != nil {
			return nil, err
		}
		lp = sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewBatchProcessor(logExp)), sdklog.WithResource(res))
		otel.SetLoggerProvider(lp)
		exportingLogs.Store(true)
	}
	slog.Info("telemetry enabled", "service", cfg.ServiceName, "logs", lp != nil)

	return func(ctx context.Context) error {
		errs := []error{tp.Shutdown(ctx), mp.Shutdown(ctx)}
		if lp != nil {
			errs = append(errs, lp.Shutdown(ctx))
		}
		return errors.Join(errs...)
	}, nil
}

// enabled reports whether any OTLP/exporter setting asks for telemetry.
func enabled() bool {
	if strings.EqualFold(os.Getenv("OTEL_SDK_DISABLED"), "true") {
		return false
	}
	for _, k := range []string{
		"OTEL_EXPORTER_OTLP_ENDPOINT",
		"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
		"OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
		"OTEL_TRACES_EXPORTER",
		"OTEL_METRICS_EXPORTER",
	} {
		if os.Getenv(k) != "" {
			return true
		}
	}
	return false
}

// HTTP instruments a handler: one server span per request (named like
// "GET /api/items/{id}" from the matched route, with http.route set) plus the
// standard http.server.* metrics. Put it outermost, outside api.Recoverer.
// A client's trace context is linked, never joined, and its baggage is ignored: anyone may send
// those headers. Behind a gateway that starts the traces, TRACE_TRUST_INBOUND=true continues
// them instead. Requests whose path is in ignorePaths (health probes, say) are not traced or
// measured.
func HTTP(next http.Handler, ignorePaths ...string) http.Handler {
	// otelhttp learns the route only after the mux has run (ServeMux sets
	// r.Pattern on the request), and puts http.route on metrics but not on the
	// span, so tag the span ourselves once next returns.
	tagRoute := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
		if route := routeOf(r.Pattern); route != "" {
			trace.SpanFromContext(r.Context()).SetAttributes(semconv.HTTPRoute(route))
		}
	})
	opts := []otelhttp.Option{
		otelhttp.WithFilter(func(r *http.Request) bool { return !slices.Contains(ignorePaths, r.URL.Path) }),
		otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
			if r.Pattern != "" { // already includes the method, e.g. "GET /api/items/{id}"
				return r.Pattern
			}
			return r.Method // unmatched routes: avoid unbounded span names
		}),
	}
	if os.Getenv("TRACE_TRUST_INBOUND") != "true" {
		// Any client may send traceparent and baggage: the request starts a trace of its own,
		// linked to the client's (so the two can still be found together), and takes in no
		// baggage, which would otherwise ride along on every call this server makes.
		opts = append(opts,
			otelhttp.WithPublicEndpointFn(func(*http.Request) bool { return true }),
			otelhttp.WithPropagators(propagation.TraceContext{}))
	}
	return otelhttp.NewHandler(tagRoute, "http.server", opts...)
}

// routeOf strips the optional "METHOD " prefix from a ServeMux pattern.
func routeOf(pattern string) string {
	if i := strings.IndexByte(pattern, ' '); i > 0 {
		return pattern[i+1:]
	}
	return pattern
}

// exportingLogs is set by Setup when logs are being exported over OTLP.
var exportingLogs atomic.Bool

// LogHandler builds the application's slog.Handler from the stdout handler:
//   - stdout always receives every record, with trace_id/span_id added when the
//     record is logged with a context that has an active span;
//   - when Setup enabled log export, records also go to OpenTelemetry (and on to
//     Loki or any OTLP backend) via the otelslog bridge, which attaches the trace
//     context itself.
//
// Log with the request context (slog.InfoContext(ctx, ...)) to get correlation.
func LogHandler(name string, stdout slog.Handler) slog.Handler {
	return newLogHandler(name, stdout, exportingLogs.Load(), otel.GetLoggerProvider())
}

func newLogHandler(name string, stdout slog.Handler, export bool, lp log.LoggerProvider) slog.Handler {
	console := NewLogHandler(stdout)
	if !export {
		return console
	}
	return slog.NewMultiHandler(console, otelslog.NewHandler(name, otelslog.WithLoggerProvider(lp)))
}

// NewLogHandler wraps a slog.Handler so records logged with a context that has
// an active span (slog.InfoContext(ctx, ...)) carry trace_id and span_id,
// linking logs to traces.
func NewLogHandler(inner slog.Handler) slog.Handler { return logHandler{inner} }

type logHandler struct{ slog.Handler }

func (h logHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(slog.String("trace_id", sc.TraceID().String()), slog.String("span_id", sc.SpanID().String()))
	}
	return h.Handler.Handle(ctx, r)
}

func (h logHandler) WithAttrs(a []slog.Attr) slog.Handler { return logHandler{h.Handler.WithAttrs(a)} }
func (h logHandler) WithGroup(n string) slog.Handler      { return logHandler{h.Handler.WithGroup(n)} }

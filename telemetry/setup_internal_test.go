package telemetry

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
)

// isolated puts the global providers and the log-export flag back after the test, since Setup
// installs its own.
func isolated(t *testing.T) {
	t.Helper()
	tp, mp, lp, prop := otel.GetTracerProvider(), otel.GetMeterProvider(), otel.GetLoggerProvider(), otel.GetTextMapPropagator()
	was := exportingLogs.Load()
	t.Cleanup(func() {
		otel.SetTracerProvider(tp)
		otel.SetMeterProvider(mp)
		otel.SetLoggerProvider(lp)
		otel.SetTextMapPropagator(prop)
		exportingLogs.Store(was)
	})
	for _, k := range []string{
		"OTEL_SDK_DISABLED", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
		"OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "OTEL_TRACES_EXPORTER", "OTEL_METRICS_EXPORTER", "OTEL_LOGS_EXPORTER",
	} {
		t.Setenv(k, "")
	}
}

func TestTelemetryIsOffUntilAnExporterIsAskedFor(t *testing.T) {
	isolated(t)
	if enabled() {
		t.Fatal("on with nothing set")
	}
	for _, k := range []string{
		"OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
		"OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "OTEL_TRACES_EXPORTER", "OTEL_METRICS_EXPORTER",
	} {
		t.Run(k, func(t *testing.T) {
			t.Setenv(k, "http://localhost:4318")
			if !enabled() {
				t.Fatalf("%s set, yet off", k)
			}
			t.Setenv("OTEL_SDK_DISABLED", "TRUE")
			if enabled() {
				t.Fatal("OTEL_SDK_DISABLED is the last word")
			}
		})
	}
}

func TestSetupWithTelemetryOffStillPropagatesTraceContext(t *testing.T) {
	isolated(t)
	shutdown, err := Setup(context.Background(), Config{ServiceName: "orders"})
	if err != nil {
		t.Fatal(err)
	}
	if fields := otel.GetTextMapPropagator().Fields(); !strings.Contains(strings.Join(fields, ","), "traceparent") {
		t.Fatalf("propagated fields %v", fields)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
	if exportingLogs.Load() {
		t.Fatal("logs exported with telemetry off")
	}
}

func TestSetupExportsTracesMetricsAndLogs(t *testing.T) {
	isolated(t)
	// "none" exporters turn telemetry on without sending anything anywhere.
	t.Setenv("OTEL_TRACES_EXPORTER", "none")
	t.Setenv("OTEL_METRICS_EXPORTER", "none")
	t.Setenv("OTEL_LOGS_EXPORTER", "console")
	shutdown, err := Setup(context.Background(), Config{ServiceName: "orders", ServiceVersion: "1.2.3"})
	if err != nil {
		t.Fatal(err)
	}
	if !exportingLogs.Load() {
		t.Fatal("logs are not exported")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestSetupLeavesLogsToStdoutWhenAsked(t *testing.T) {
	isolated(t)
	t.Setenv("OTEL_TRACES_EXPORTER", "none")
	t.Setenv("OTEL_METRICS_EXPORTER", "none")
	t.Setenv("OTEL_LOGS_EXPORTER", "none")
	shutdown, err := Setup(context.Background(), Config{ServiceName: "orders"})
	if err != nil {
		t.Fatal(err)
	}
	if exportingLogs.Load() {
		t.Fatal("logs exported despite OTEL_LOGS_EXPORTER=none")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestSetupRefusesAnExporterItDoesNotKnow(t *testing.T) {
	for _, k := range []string{"OTEL_TRACES_EXPORTER", "OTEL_METRICS_EXPORTER", "OTEL_LOGS_EXPORTER"} {
		t.Run(k, func(t *testing.T) {
			isolated(t)
			t.Setenv("OTEL_TRACES_EXPORTER", "none")
			t.Setenv("OTEL_METRICS_EXPORTER", "none")
			t.Setenv("OTEL_LOGS_EXPORTER", "none")
			t.Setenv(k, "carrier-pigeon")
			if _, err := Setup(context.Background(), Config{ServiceName: "orders"}); err == nil {
				t.Fatalf("%s=carrier-pigeon was accepted", k)
			}
		})
	}
}

func TestLogHandlerKeepsTraceIDsThroughAttrsAndGroups(t *testing.T) {
	isolated(t)
	var out bytes.Buffer
	h := LogHandler("orders", slog.NewTextHandler(&out, nil)).WithAttrs([]slog.Attr{slog.String("tenant", "acme")}).WithGroup("order")
	if _, ok := h.(logHandler); !ok {
		t.Fatalf("WithAttrs and WithGroup dropped the trace IDs: %T", h)
	}
	slog.New(h).Info("placed", "id", 7)
	if got := out.String(); !strings.Contains(got, "tenant=acme") || !strings.Contains(got, "order.id=7") {
		t.Fatalf("%s", got)
	}
}

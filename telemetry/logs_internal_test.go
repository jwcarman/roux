package telemetry

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"sync"
	"testing"

	"go.opentelemetry.io/otel/attribute"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// captureExporter records the OTel log records it is asked to export.
type captureExporter struct {
	mu   sync.Mutex
	recs []sdklog.Record
}

func (c *captureExporter) Export(_ context.Context, r []sdklog.Record) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, rec := range r {
		c.recs = append(c.recs, rec.Clone())
	}
	return nil
}
func (*captureExporter) Shutdown(context.Context) error   { return nil }
func (*captureExporter) ForceFlush(context.Context) error { return nil }

func TestLogsGoToStdoutAndOTel(t *testing.T) {
	var stdout bytes.Buffer
	exp := &captureExporter{}
	lp := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewSimpleProcessor(exp)))

	h := newLogHandler("test", slog.NewJSONHandler(&stdout, nil), true, lp)
	logger := slog.New(h)

	tp := sdktrace.NewTracerProvider()
	ctx, span := tp.Tracer("t").Start(context.Background(), "op")
	logger.InfoContext(ctx, "hello", "item", 42)
	span.End()
	traceID := span.SpanContext().TraceID()

	// stdout keeps working, with trace ids attached.
	if out := stdout.String(); !strings.Contains(out, `"msg":"hello"`) || !strings.Contains(out, traceID.String()) {
		t.Fatalf("stdout: %s", out)
	}

	// The same record reached the OTel pipeline, linked to the span.
	if len(exp.recs) != 1 {
		t.Fatalf("exported %d records, want 1", len(exp.recs))
	}
	rec := exp.recs[0]
	if rec.Body().AsString() != "hello" || rec.TraceID() != traceID || rec.SpanID() != span.SpanContext().SpanID() {
		t.Fatalf("record body=%q trace=%s span=%s", rec.Body().AsString(), rec.TraceID(), rec.SpanID())
	}
	var item int64
	rec.WalkAttributes(func(kv attribute.KeyValue) bool {
		if kv.Key == "item" {
			item = kv.Value.AsInt64()
		}
		return true
	})
	if item != 42 {
		t.Fatalf("attribute item = %d", item)
	}
}

func TestLogsStdoutOnlyWhenExportDisabled(t *testing.T) {
	var stdout bytes.Buffer
	exp := &captureExporter{}
	lp := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewSimpleProcessor(exp)))

	slog.New(newLogHandler("test", slog.NewJSONHandler(&stdout, nil), false, lp)).Info("quiet")

	if !strings.Contains(stdout.String(), "quiet") {
		t.Fatalf("stdout: %s", stdout.String())
	}
	if len(exp.recs) != 0 {
		t.Fatalf("exported %d records with export disabled", len(exp.recs))
	}
}

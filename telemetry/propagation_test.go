package telemetry_test

import "go.opentelemetry.io/otel/propagation"

func propagationW3C() propagation.TextMapPropagator {
	return propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{})
}

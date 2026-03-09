package telemetry

import (
	"context"
	"net/http"
	"reflect"
	"testing"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (fn roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return fn(r)
}

func TestInitNoopWithoutEndpoint(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	shutdown, err := Init(context.Background())
	if err != nil {
		t.Fatalf("Init() error = %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown() error = %v", err)
	}
}

func TestWrapTransportUsesBaseWhenTelemetryDisabled(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	base := roundTripperFunc(func(*http.Request) (*http.Response, error) { return nil, nil })
	wrapped := WrapTransport(base)

	if reflect.ValueOf(wrapped).Pointer() != reflect.ValueOf(base).Pointer() {
		t.Fatal("WrapTransport() should return the base transport when telemetry is disabled")
	}
}

func TestWrapTransportWrapsBaseWhenTelemetryEnabled(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")

	base := roundTripperFunc(func(*http.Request) (*http.Response, error) { return nil, nil })
	wrapped := WrapTransport(base)

	if reflect.ValueOf(wrapped).Pointer() == reflect.ValueOf(base).Pointer() {
		t.Fatal("WrapTransport() should wrap the base transport when telemetry is enabled")
	}
}

package main

import (
	"context"
	"crypto/sha256"
	"log/slog"
	"net/http"
	"os"

	gongyu "github.com/angristan/gongyu"
	"github.com/angristan/gongyu/internal/handler"
	"github.com/angristan/gongyu/internal/store"
	"github.com/angristan/gongyu/internal/telemetry"
)

func main() {
	ctx := context.Background()

	otelShutdown, err := telemetry.Init(ctx)
	if err != nil {
		slog.Error("failed to init telemetry", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := otelShutdown(ctx); err != nil {
			slog.Error("failed to shutdown telemetry", "error", err)
		}
	}()

	databaseURL := envOr("DATABASE_URL", "postgres://localhost:5432/gongyu?sslmode=disable")
	addr := envOr("LISTEN_ADDR", ":8080")
	baseURL := envOr("BASE_URL", "http://localhost:8080")
	appKey := envOr("APP_KEY", "change-me-to-a-random-32-byte-key!!")

	// Derive a 32-byte encryption key from APP_KEY
	hash := sha256.Sum256([]byte(appKey))
	encKey := hash[:]

	db, err := store.Open(databaseURL)
	if err != nil {
		slog.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Error("failed to close database", "error", err)
		}
	}()

	h := handler.New(db, encKey, baseURL, gongyu.StaticFS)
	router := h.Routes()

	slog.Info("server starting", "addr", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

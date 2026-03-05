package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	gongyu "github.com/angristan/gongyu"
	"github.com/angristan/gongyu/internal/handler"
	"github.com/angristan/gongyu/internal/store"
	"github.com/angristan/gongyu/internal/telemetry"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	otelShutdown, err := telemetry.Init(ctx)
	if err != nil {
		slog.Error("failed to init telemetry", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := otelShutdown(context.Background()); err != nil {
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

	srv := &http.Server{
		Addr:    addr,
		Handler: h.Routes(),
	}

	// Start server in a goroutine
	go func() {
		slog.Info("server starting", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	<-ctx.Done()
	slog.Info("shutting down")

	// Give in-flight requests 10 seconds to complete
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown error", "error", err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

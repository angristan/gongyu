package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	gongyu "github.com/angristan/gongyu"
	"github.com/angristan/gongyu/internal/background"
	"github.com/angristan/gongyu/internal/handler"
	"github.com/angristan/gongyu/internal/store"
	"github.com/angristan/gongyu/internal/telemetry"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, os.Getenv); err != nil {
		slog.Error("server exited", "error", err)
		os.Exit(1)
	}
}

type config struct {
	DatabaseURL string
	Addr        string
	BaseURL     string
	AppKey      string
}

func loadConfig(getenv func(string) string) (config, error) {
	cfg := config{
		DatabaseURL: envOrWith(getenv, "DATABASE_URL", "postgres://localhost:5432/gongyu?sslmode=disable"),
		Addr:        envOrWith(getenv, "LISTEN_ADDR", ":8080"),
		BaseURL:     envOrWith(getenv, "BASE_URL", "http://localhost:8080"),
		AppKey:      getenv("APP_KEY"),
	}
	if cfg.AppKey == "" {
		return config{}, errors.New("APP_KEY environment variable must be set to a random secret")
	}
	return cfg, nil
}

func envOrWith(getenv func(string) string, key, fallback string) string {
	if v := getenv(key); v != "" {
		return v
	}
	return fallback
}

func newHTTPClient() *http.Client {
	return &http.Client{
		Transport: telemetry.WrapTransport(http.DefaultTransport),
	}
}

func run(ctx context.Context, getenv func(string) string) error {
	otelShutdown, err := telemetry.Init(ctx)
	if err != nil {
		return fmt.Errorf("init telemetry: %w", err)
	}
	defer func() {
		if err := otelShutdown(context.Background()); err != nil {
			slog.Error("failed to shutdown telemetry", "error", err)
		}
	}()

	cfg, err := loadConfig(getenv)
	if err != nil {
		return err
	}

	hash := sha256.Sum256([]byte(cfg.AppKey))
	encKey := hash[:]

	db, err := store.Open(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Error("failed to close database", "error", err)
		}
	}()

	bg := background.New(1)
	defer bg.Shutdown()

	bg.Every(time.Hour, func(taskCtx context.Context) {
		n, err := db.DeleteExpiredSessions(taskCtx)
		if err != nil {
			slog.Error("failed to delete expired sessions", "error", err)
		} else if n > 0 {
			slog.Info("deleted expired sessions", "count", n)
		}
	})

	h, err := handler.New(db, encKey, cfg.BaseURL, gongyu.StaticFS, bg, newHTTPClient())
	if err != nil {
		return fmt.Errorf("create handler: %w", err)
	}

	srv := &http.Server{
		Addr:    cfg.Addr,
		Handler: h.Routes(),
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("server starting", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		slog.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("server shutdown: %w", err)
		}
		return nil
	case err := <-errCh:
		return fmt.Errorf("listen: %w", err)
	}
}

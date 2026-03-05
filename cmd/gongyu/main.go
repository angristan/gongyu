package main

import (
	"crypto/sha256"
	"fmt"
	"log"
	"net/http"
	"os"

	gongyu "github.com/angristan/gongyu"
	"github.com/angristan/gongyu/internal/handler"
	"github.com/angristan/gongyu/internal/store"
)

func main() {
	databaseURL := envOr("DATABASE_URL", "postgres://localhost:5432/gongyu?sslmode=disable")
	addr := envOr("LISTEN_ADDR", ":8080")
	baseURL := envOr("BASE_URL", "http://localhost:8080")
	appKey := envOr("APP_KEY", "change-me-to-a-random-32-byte-key!!")

	// Derive a 32-byte encryption key from APP_KEY
	hash := sha256.Sum256([]byte(appKey))
	encKey := hash[:]

	db, err := store.Open(databaseURL)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Printf("failed to close database: %v", err)
		}
	}() //nolint:errcheck

	h := handler.New(db, encKey, baseURL, gongyu.StaticFS)
	router := h.Routes()

	fmt.Printf("Gongyu listening on %s\n", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

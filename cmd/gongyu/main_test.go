package main

import "testing"

func TestLoadConfigUsesDefaults(t *testing.T) {
	cfg, err := loadConfig(func(key string) string {
		if key == "APP_KEY" {
			return "secret"
		}
		return ""
	})
	if err != nil {
		t.Fatalf("loadConfig() error = %v", err)
	}

	if cfg.DatabaseURL != "postgres://localhost:5432/gongyu?sslmode=disable" {
		t.Fatalf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if cfg.Addr != ":8080" {
		t.Fatalf("Addr = %q", cfg.Addr)
	}
	if cfg.BaseURL != "http://localhost:8080" {
		t.Fatalf("BaseURL = %q", cfg.BaseURL)
	}
	if cfg.AppKey != "secret" {
		t.Fatalf("AppKey = %q", cfg.AppKey)
	}
}

func TestLoadConfigUsesEnvironmentValues(t *testing.T) {
	env := map[string]string{
		"DATABASE_URL": "postgres://db/gongyu",
		"LISTEN_ADDR":  ":9090",
		"BASE_URL":     "https://gongyu.example",
		"APP_KEY":      "secret",
	}

	cfg, err := loadConfig(func(key string) string { return env[key] })
	if err != nil {
		t.Fatalf("loadConfig() error = %v", err)
	}

	if cfg.DatabaseURL != env["DATABASE_URL"] {
		t.Fatalf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if cfg.Addr != env["LISTEN_ADDR"] {
		t.Fatalf("Addr = %q", cfg.Addr)
	}
	if cfg.BaseURL != env["BASE_URL"] {
		t.Fatalf("BaseURL = %q", cfg.BaseURL)
	}
}

func TestLoadConfigRequiresAppKey(t *testing.T) {
	_, err := loadConfig(func(string) string { return "" })
	if err == nil {
		t.Fatal("loadConfig() error = nil, want error")
	}
}

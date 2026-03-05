package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Env            string
	Addr           string
	AppName        string
	AppURL         string
	DatabaseURL    string
	SessionSecret  string
	SettingSecret  string
	AllowInsecure  bool
	UmamiURL       string
	UmamiWebsiteID string
}

func Load() (Config, error) {
	cfg := Config{
		Env:            getEnv("APP_ENV", "development"),
		Addr:           getEnv("APP_ADDR", ":8080"),
		AppName:        getEnv("APP_NAME", "Gongyu"),
		AppURL:         strings.TrimRight(getEnv("APP_URL", "http://localhost:8080"), "/"),
		DatabaseURL:    getEnv("DATABASE_URL", "sqlite://gongyu.db"),
		SessionSecret:  getEnv("SESSION_SECRET", ""),
		SettingSecret:  getEnv("SETTING_SECRET", ""),
		AllowInsecure:  getEnv("ALLOW_INSECURE_COOKIES", "true") == "true",
		UmamiURL:       getEnv("UMAMI_URL", ""),
		UmamiWebsiteID: getEnv("UMAMI_WEBSITE_ID", ""),
	}

	if cfg.SessionSecret == "" {
		return Config{}, fmt.Errorf("SESSION_SECRET is required")
	}
	if cfg.SettingSecret == "" {
		return Config{}, fmt.Errorf("SETTING_SECRET is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

package model

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestGenerateShortURL(t *testing.T) {
	url, err := GenerateShortURL()
	if err != nil {
		t.Fatalf("GenerateShortURL() error = %v", err)
	}
	if len(url) != 8 {
		t.Errorf("GenerateShortURL() length = %d, want 8", len(url))
	}
	for _, c := range url {
		if (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && (c < '0' || c > '9') {
			t.Errorf("GenerateShortURL() contains invalid char %c", c)
		}
	}

	// Should produce unique values
	seen := make(map[string]bool)
	for range 100 {
		s, err := GenerateShortURL()
		if err != nil {
			t.Fatalf("GenerateShortURL() error = %v", err)
		}
		if seen[s] {
			t.Errorf("GenerateShortURL() produced duplicate: %s", s)
		}
		seen[s] = true
	}
}

func TestUserPasswordOmittedFromJSON(t *testing.T) {
	u := User{
		ID:       1,
		Name:     "test",
		Email:    "test@example.com",
		Password: "$2a$10$somebcrypthash",
	}
	data, err := json.Marshal(u)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "bcrypt") || strings.Contains(string(data), "password") {
		t.Errorf("User JSON should not contain password, got: %s", data)
	}
}

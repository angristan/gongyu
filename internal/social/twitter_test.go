package social

import (
	"encoding/json"
	"testing"
)

func TestTruncateRunes(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		maxLen int
		want   string
	}{
		{"short ASCII", "hello", 10, "hello"},
		{"exact limit", "hello", 5, "hello"},
		{"truncate ASCII", "hello world", 6, "hello…"},
		{"short CJK", "日本語", 10, "日本語"},
		{"truncate CJK", "日本語テスト", 4, "日本語…"},
		{"mixed multibyte", "Go言語プログラミング", 5, "Go言語…"},
		{"emoji preserved", "hello 🌍🌎🌏", 8, "hello 🌍…"},
		{"empty", "", 10, ""},
		{"maxLen 1", "abc", 1, "…"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := truncateRunes(tt.input, tt.maxLen)
			if got != tt.want {
				t.Errorf("truncateRunes(%q, %d) = %q, want %q", tt.input, tt.maxLen, got, tt.want)
			}
			// Result must never exceed maxLen runes
			if len([]rune(got)) > tt.maxLen {
				t.Errorf("result %q has %d runes, exceeds maxLen %d", got, len([]rune(got)), tt.maxLen)
			}
		})
	}
}

func TestOAuthSignatureBase(t *testing.T) {
	params := map[string]string{
		"oauth_consumer_key": "key",
		"oauth_nonce":        "nonce",
		"oauth_timestamp":    "12345",
	}
	got := oauthSignatureBase("POST", "https://api.example.com/endpoint", params)

	// Should be: METHOD&encoded_url&encoded_params
	if got == "" {
		t.Error("oauthSignatureBase returned empty string")
	}
	// Params should be sorted alphabetically
	if got[:4] != "POST" {
		t.Errorf("should start with POST, got %q", got[:4])
	}
	// Contains all three params
	for _, key := range []string{"oauth_consumer_key", "oauth_nonce", "oauth_timestamp"} {
		if !contains(got, key) {
			t.Errorf("missing param %q in signature base", key)
		}
	}
}

func TestTweetBodyJSON(t *testing.T) {
	tests := []struct {
		input string
	}{
		{"hello"},
		{`say "hi"`},
		{"line\nbreak"},
		{"tab\there"},
		{"back\\slash"},
		{"return\rhere"},
		{"null\x00byte"},
	}

	for _, tt := range tests {
		body, err := json.Marshal(map[string]string{"text": tt.input})
		if err != nil {
			t.Errorf("json.Marshal failed for %q: %v", tt.input, err)
			continue
		}
		var decoded map[string]string
		if err := json.Unmarshal(body, &decoded); err != nil {
			t.Errorf("json.Unmarshal failed for %q: %v", tt.input, err)
			continue
		}
		if decoded["text"] != tt.input {
			t.Errorf("round-trip failed for %q: got %q", tt.input, decoded["text"])
		}
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

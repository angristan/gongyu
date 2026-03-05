package social

import "testing"

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

func TestJsonString(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"hello", `"hello"`},
		{`say "hi"`, `"say \"hi\""`},
		{"line\nbreak", `"line\nbreak"`},
		{"tab\there", `"tab\there"`},
		{"back\\slash", `"back\\slash"`},
		{"return\rhere", `"return\rhere"`},
	}

	for _, tt := range tests {
		got := jsonString(tt.input)
		if got != tt.want {
			t.Errorf("jsonString(%q) = %q, want %q", tt.input, got, tt.want)
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

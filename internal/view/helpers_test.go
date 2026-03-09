package view

import "testing"

func TestTruncate(t *testing.T) {
	tests := []struct {
		input string
		n     int
		want  string
	}{
		{"hello", 10, "hello"},
		{"hello", 5, "hello"},
		{"hello world", 5, "hell…"},
		{"", 5, ""},
		// Multi-byte: "こんにちは" is 5 runes but 15 bytes
		{"こんにちは", 5, "こんにちは"},
		{"こんにちは世界", 5, "こんにち…"},
		// Emoji: each flag emoji is 1+ runes
		{"🇫🇷 hello world", 8, "🇫🇷 hell…"},
	}
	for _, tt := range tests {
		got := Truncate(tt.input, tt.n)
		if got != tt.want {
			t.Errorf("Truncate(%q, %d) = %q, want %q", tt.input, tt.n, got, tt.want)
		}
	}
}

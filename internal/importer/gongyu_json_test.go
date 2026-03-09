package importer

import (
	"testing"
)

func TestParseGongyuJSON(t *testing.T) {
	input := `{
		"bookmarks": [
			{"url": "https://example.com", "title": "Example", "short_url": "abc"},
			{"url": "https://go.dev", "title": "Go"}
		]
	}`

	bookmarks, err := ParseGongyuJSON(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(bookmarks) != 2 {
		t.Fatalf("got %d bookmarks, want 2", len(bookmarks))
	}
	if bookmarks[0].Url != "https://example.com" {
		t.Errorf("bookmarks[0].Url = %q, want %q", bookmarks[0].Url, "https://example.com")
	}
	if bookmarks[0].Title != "Example" {
		t.Errorf("bookmarks[0].Title = %q, want %q", bookmarks[0].Title, "Example")
	}
	if bookmarks[1].Url != "https://go.dev" {
		t.Errorf("bookmarks[1].Url = %q, want %q", bookmarks[1].Url, "https://go.dev")
	}
}

func TestParseGongyuJSONEmpty(t *testing.T) {
	bookmarks, err := ParseGongyuJSON(`{"bookmarks": []}`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(bookmarks) != 0 {
		t.Errorf("got %d bookmarks, want 0", len(bookmarks))
	}
}

func TestParseGongyuJSONInvalid(t *testing.T) {
	_, err := ParseGongyuJSON(`not json`)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

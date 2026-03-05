package exporter

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stanislas/gongyu/internal/model"
)

func TestGenerateJSON(t *testing.T) {
	bookmarks := []model.Bookmark{
		{
			ID:       1,
			Url:      "https://example.com",
			Title:    "Example",
			ShortUrl: "abc",
		},
		{
			ID:       2,
			Url:      "https://go.dev",
			Title:    "Go",
			ShortUrl: "def",
		},
	}

	data, err := GenerateJSON(bookmarks)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var export jsonExport
	if err := json.Unmarshal(data, &export); err != nil {
		t.Fatalf("invalid JSON output: %v", err)
	}

	if export.Version != "1.0" {
		t.Errorf("Version = %q, want %q", export.Version, "1.0")
	}
	if export.Count != 2 {
		t.Errorf("Count = %d, want 2", export.Count)
	}
	if len(export.Bookmarks) != 2 {
		t.Fatalf("len(Bookmarks) = %d, want 2", len(export.Bookmarks))
	}
	if export.Bookmarks[0].Url != "https://example.com" {
		t.Errorf("Bookmarks[0].Url = %q, want %q", export.Bookmarks[0].Url, "https://example.com")
	}

	// ExportedAt should parse as RFC3339
	if _, err := time.Parse(time.RFC3339, export.ExportedAt); err != nil {
		t.Errorf("ExportedAt %q is not valid RFC3339: %v", export.ExportedAt, err)
	}
}

func TestGenerateJSONEmpty(t *testing.T) {
	data, err := GenerateJSON(nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var export jsonExport
	if err := json.Unmarshal(data, &export); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if export.Count != 0 {
		t.Errorf("Count = %d, want 0", export.Count)
	}
}

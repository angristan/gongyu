package feed

import (
	"encoding/xml"
	"strings"
	"testing"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

func TestGenerateAtom(t *testing.T) {
	bookmarks := []model.Bookmark{
		{
			ShortUrl:    "abc",
			Url:         "https://example.com",
			Title:       "Example",
			Description: "A test bookmark",
			CreatedAt:   time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC),
			UpdatedAt:   time.Date(2024, 2, 20, 12, 0, 0, 0, time.UTC),
		},
		{
			ShortUrl:  "def",
			Url:       "https://go.dev",
			Title:     "Go",
			CreatedAt: time.Date(2024, 1, 16, 10, 0, 0, 0, time.UTC),
			UpdatedAt: time.Date(2024, 1, 16, 10, 0, 0, 0, time.UTC),
		},
	}

	data, err := GenerateAtom("https://bookmarks.example.com", bookmarks)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	output := string(data)

	// Should start with XML declaration
	if !strings.HasPrefix(output, "<?xml") {
		t.Error("output should start with XML declaration")
	}

	// Parse the XML to verify structure
	var feed atomFeed
	// Strip XML header for unmarshaling
	xmlBody := output[strings.Index(output, "<feed"):]
	if err := xml.Unmarshal([]byte(xmlBody), &feed); err != nil {
		t.Fatalf("invalid XML output: %v", err)
	}

	if feed.Title != "Gongyu Bookmarks" {
		t.Errorf("Title = %q, want %q", feed.Title, "Gongyu Bookmarks")
	}
	if feed.ID != "https://bookmarks.example.com/feed" {
		t.Errorf("ID = %q, want %q", feed.ID, "https://bookmarks.example.com/feed")
	}
	if len(feed.Entries) != 2 {
		t.Fatalf("got %d entries, want 2", len(feed.Entries))
	}

	entry := feed.Entries[0]
	if entry.Title != "Example" {
		t.Errorf("entry.Title = %q, want %q", entry.Title, "Example")
	}
	if entry.Link.Href != "https://example.com" {
		t.Errorf("entry.Link.Href = %q, want %q", entry.Link.Href, "https://example.com")
	}
	if entry.ID != "https://bookmarks.example.com/b/abc" {
		t.Errorf("entry.ID = %q, want %q", entry.ID, "https://bookmarks.example.com/b/abc")
	}
	if entry.Summary == nil || *entry.Summary != "A test bookmark" {
		t.Errorf("entry.Summary = %v, want %q", entry.Summary, "A test bookmark")
	}

	// Entry Updated should use UpdatedAt, not CreatedAt
	wantUpdated := "2024-02-20T12:00:00Z"
	if entry.Updated != wantUpdated {
		t.Errorf("entry.Updated = %q, want %q (should use UpdatedAt)", entry.Updated, wantUpdated)
	}

	// Second entry should have no summary
	if feed.Entries[1].Summary != nil {
		t.Errorf("second entry Summary should be nil, got %q", *feed.Entries[1].Summary)
	}
}

func TestGenerateAtomEmpty(t *testing.T) {
	data, err := GenerateAtom("https://example.com", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	output := string(data)
	if !strings.Contains(output, "<feed") {
		t.Error("empty bookmarks should still produce a valid feed")
	}
	if strings.Contains(output, "<entry>") {
		t.Error("empty bookmarks should have no entries")
	}
}

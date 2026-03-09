package importer

import (
	"testing"
	"time"
)

func TestParseNetscapeBookmarks(t *testing.T) {
	content := `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1700000000">Example Site</A>
    <DD>A description here
    <DT><A HREF="https://github.com" ADD_DATE="1700000100">GitHub</A>
    <DT><A HREF="https://shaarli.example.com/?abc123" ADD_DATE="1700000200">Shaarli Link</A>
</DL><p>`

	bookmarks := ParseNetscapeBookmarks(content)

	if len(bookmarks) != 3 {
		t.Fatalf("got %d bookmarks, want 3", len(bookmarks))
	}

	// First bookmark
	b := bookmarks[0]
	if b.Url != "https://example.com" {
		t.Errorf("Url = %q, want %q", b.Url, "https://example.com")
	}
	if b.Title != "Example Site" {
		t.Errorf("Title = %q, want %q", b.Title, "Example Site")
	}
	if b.Description != "A description here" {
		t.Errorf("Description = %q, want %q", b.Description, "A description here")
	}
	wantTime := time.Unix(1700000000, 0).UTC()
	if !b.CreatedAt.Equal(wantTime) {
		t.Errorf("CreatedAt = %v, want %v", b.CreatedAt, wantTime)
	}

	// Second bookmark — no description
	if bookmarks[1].Description != "" {
		t.Errorf("second bookmark Description = %q, want empty", bookmarks[1].Description)
	}

	// Third bookmark — Shaarli hash detection
	if bookmarks[2].ShaarliShortUrl != "abc123" {
		t.Errorf("ShaarliShortUrl = %q, want %q", bookmarks[2].ShaarliShortUrl, "abc123")
	}
}

func TestParseNetscapeBookmarksEmpty(t *testing.T) {
	bookmarks := ParseNetscapeBookmarks("")
	if bookmarks != nil {
		t.Errorf("empty input should return nil, got %v", bookmarks)
	}
}

func TestParseNetscapeBookmarksSkipsInvalid(t *testing.T) {
	// No HREF
	content := `<DT><A ADD_DATE="123">No href</A>`
	bookmarks := ParseNetscapeBookmarks(content)
	if len(bookmarks) != 0 {
		t.Errorf("got %d bookmarks for no-href, want 0", len(bookmarks))
	}

	// Empty title
	content = `<DT><A HREF="https://example.com" ADD_DATE="123"></A>`
	bookmarks = ParseNetscapeBookmarks(content)
	if len(bookmarks) != 0 {
		t.Errorf("got %d bookmarks for empty title, want 0", len(bookmarks))
	}
}

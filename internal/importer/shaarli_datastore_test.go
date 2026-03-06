package importer

import (
	"bytes"
	"compress/flate"
	"encoding/base64"
	"testing"
)

func TestParseSerializedPHP(t *testing.T) {
	// Simplified PHP serialized data with 2 links
	data := `s:3:"url";s:19:"https://example.com"` +
		`s:5:"title";s:7:"Example"` +
		`s:11:"description";s:11:"A test link"` +
		`s:8:"shorturl";s:6:"abc123"` +
		`s:7:"created";i:1700000000` +
		`s:3:"url";s:15:"https://go.dev/"` +
		`s:5:"title";s:6:"Go Dev"` +
		`s:11:"description";s:0:""` +
		`s:8:"shorturl";s:6:"def456"` +
		`s:7:"created";i:1700000100`

	bookmarks, err := parseSerializedPHP(data)
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
	if bookmarks[0].Description != "A test link" {
		t.Errorf("bookmarks[0].Description = %q, want %q", bookmarks[0].Description, "A test link")
	}
	if bookmarks[0].ShaarliShortUrl != "abc123" {
		t.Errorf("bookmarks[0].ShaarliShortUrl = %q, want %q", bookmarks[0].ShaarliShortUrl, "abc123")
	}
	if bookmarks[0].CreatedAt.Unix() != 1700000000 {
		t.Errorf("bookmarks[0].CreatedAt unix = %d, want 1700000000", bookmarks[0].CreatedAt.Unix())
	}

	if bookmarks[1].Url != "https://go.dev/" {
		t.Errorf("bookmarks[1].Url = %q, want %q", bookmarks[1].Url, "https://go.dev/")
	}
}

func TestParseShaarliDatastore(t *testing.T) {
	// Build a valid datastore: <?php /* base64(deflate(serialized)) */ ?>
	serialized := `s:3:"url";s:19:"https://example.com"` +
		`s:5:"title";s:7:"Example"` +
		`s:11:"description";s:4:"test"` +
		`s:8:"shorturl";s:3:"abc"` +
		`s:7:"created";i:1700000000`

	// Compress with raw DEFLATE (matching PHP gzdeflate)
	var buf bytes.Buffer
	w, err := flate.NewWriter(&buf, flate.DefaultCompression)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write([]byte(serialized)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}

	encoded := base64.StdEncoding.EncodeToString(buf.Bytes())
	content := "<?php /* " + encoded + " */ ?>"

	bookmarks, err := ParseShaarliDatastore(content)
	if err != nil {
		t.Fatalf("ParseShaarliDatastore() error: %v", err)
	}
	if len(bookmarks) != 1 {
		t.Fatalf("got %d bookmarks, want 1", len(bookmarks))
	}
	if bookmarks[0].Url != "https://example.com" {
		t.Errorf("Url = %q, want %q", bookmarks[0].Url, "https://example.com")
	}
	if bookmarks[0].Title != "Example" {
		t.Errorf("Title = %q, want %q", bookmarks[0].Title, "Example")
	}
}

func TestParseSerializedPHPEmpty(t *testing.T) {
	bookmarks, err := parseSerializedPHP("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(bookmarks) != 0 {
		t.Errorf("got %d bookmarks, want 0", len(bookmarks))
	}
}

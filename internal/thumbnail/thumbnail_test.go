package thumbnail

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func serveHTML(html string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		if _, err := w.Write([]byte(html)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
}

func TestFetchMetadata(t *testing.T) {
	srv := serveHTML(`<!DOCTYPE html>
<html>
<head>
	<title>Page Title</title>
	<meta property="og:title" content="OG Title">
	<meta property="og:description" content="OG Description">
	<meta property="og:image" content="https://example.com/image.jpg">
	<meta name="description" content="Meta description">
</head>
<body></body>
</html>`)
	defer srv.Close()

	meta, err := FetchMetadata(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if meta.Title != "OG Title" {
		t.Errorf("Title = %q, want %q", meta.Title, "OG Title")
	}
	if meta.Description != "OG Description" {
		t.Errorf("Description = %q, want %q", meta.Description, "OG Description")
	}
	if meta.OGImage != "https://example.com/image.jpg" {
		t.Errorf("OGImage = %q, want %q", meta.OGImage, "https://example.com/image.jpg")
	}
}

func TestFetchMetadataFallbackToTitle(t *testing.T) {
	srv := serveHTML(`<html><head><title>Fallback Title</title></head></html>`)
	defer srv.Close()

	meta, err := FetchMetadata(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if meta.Title != "Fallback Title" {
		t.Errorf("Title = %q, want %q", meta.Title, "Fallback Title")
	}
}

func TestFetchMetadataFallbackToMetaDescription(t *testing.T) {
	srv := serveHTML(`<html><head><meta name="description" content="Meta desc"></head></html>`)
	defer srv.Close()

	meta, err := FetchMetadata(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if meta.Description != "Meta desc" {
		t.Errorf("Description = %q, want %q", meta.Description, "Meta desc")
	}
}

func TestFetchMetadataRelativeOGImage(t *testing.T) {
	srv := serveHTML(`<html><head><meta property="og:image" content="/images/thumb.png"></head></html>`)
	defer srv.Close()

	meta, err := FetchMetadata(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := srv.URL + "/images/thumb.png"
	if meta.OGImage != want {
		t.Errorf("OGImage = %q, want %q", meta.OGImage, want)
	}
}

func TestFetchMetadataEmptyPage(t *testing.T) {
	srv := serveHTML("")
	defer srv.Close()

	meta, err := FetchMetadata(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if meta.Title != "" || meta.Description != "" || meta.OGImage != "" {
		t.Errorf("empty page should produce empty metadata, got %+v", meta)
	}
}

func TestFetchMetadataHTMLEntityDecoding(t *testing.T) {
	srv := serveHTML(`<html><head><title>Tom &amp; Jerry</title></head></html>`)
	defer srv.Close()

	meta, err := FetchMetadata(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if meta.Title != "Tom & Jerry" {
		t.Errorf("Title = %q, want %q", meta.Title, "Tom & Jerry")
	}
}

package handler

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

func TestHomePageEmpty(t *testing.T) {
	store := &mockStore{
		searchBookmarks: func(ctx context.Context, query string, page, perPage int) (*model.PaginatedBookmarks, error) {
			return &model.PaginatedBookmarks{CurrentPage: 1, LastPage: 1}, nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Errorf("content-type = %q, want text/html", ct)
	}
}

func TestHomePageWithBookmarks(t *testing.T) {
	store := &mockStore{
		searchBookmarks: func(ctx context.Context, query string, page, perPage int) (*model.PaginatedBookmarks, error) {
			return &model.PaginatedBookmarks{
				Bookmarks: []model.Bookmark{
					{ID: 1, Title: "Test Bookmark", Url: "https://example.com", ShortUrl: "abc123", CreatedAt: time.Now(), UpdatedAt: time.Now()},
				},
				CurrentPage: 1, LastPage: 1, Total: 1,
			}, nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestHomePageSearch(t *testing.T) {
	var searchedQuery string
	store := &mockStore{
		searchBookmarks: func(ctx context.Context, query string, page, perPage int) (*model.PaginatedBookmarks, error) {
			searchedQuery = query
			return &model.PaginatedBookmarks{CurrentPage: 1, LastPage: 1}, nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/?q=golang")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if searchedQuery != "golang" {
		t.Errorf("search query = %q, want %q", searchedQuery, "golang")
	}
}

func TestShowBookmark(t *testing.T) {
	store := &mockStore{
		getBookmarkByShortURL: func(ctx context.Context, shortUrl string) (model.Bookmark, error) {
			if shortUrl == "abc123" {
				return model.Bookmark{ID: 1, Title: "Test", Url: "https://example.com", ShortUrl: "abc123", CreatedAt: time.Now(), UpdatedAt: time.Now()}, nil
			}
			return model.Bookmark{}, sql.ErrNoRows
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/b/abc123")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestShowBookmarkNotFound(t *testing.T) {
	store := &mockStore{
		getBookmarkByShortURL: func(ctx context.Context, shortUrl string) (model.Bookmark, error) {
			return model.Bookmark{}, sql.ErrNoRows
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/b/nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 404 {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestLegacyShaarliRedirect(t *testing.T) {
	store := &mockStore{
		getBookmarkByShaarliHash: func(ctx context.Context, hash string) (model.Bookmark, error) {
			if hash == "oldhash" {
				return model.Bookmark{ShortUrl: "newshort"}, nil
			}
			return model.Bookmark{}, sql.ErrNoRows
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := noRedirectClient().Get(srv.URL + "/shaare/oldhash")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 301 {
		t.Errorf("status = %d, want 301", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if loc != "/b/newshort" {
		t.Errorf("Location = %q, want /b/newshort", loc)
	}
}

func TestFeed(t *testing.T) {
	store := &mockStore{
		recentBookmarks: func(ctx context.Context, limit int64) ([]model.Bookmark, error) {
			return []model.Bookmark{
				{ID: 1, Title: "Feed Item", Url: "https://example.com", ShortUrl: "abc", CreatedAt: time.Now(), UpdatedAt: time.Now()},
			}, nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/feed")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "atom+xml") {
		t.Errorf("content-type = %q, want atom+xml", ct)
	}
}

func TestStaticFiles(t *testing.T) {
	store := &mockStore{
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/static/nonexistent.css")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 404 {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestExtractDomain(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"https://www.example.com/path", "example.com"},
		{"https://example.com", "example.com"},
		{"http://sub.example.com/page?q=1", "sub.example.com"},
		{"not-a-url", ""},
	}
	for _, tt := range tests {
		got := extractDomain(tt.input)
		if got != tt.want {
			t.Errorf("extractDomain(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

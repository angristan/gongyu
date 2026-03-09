package handler

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

func TestAdminImportUnknownType(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := newMultipartImportRequest(srv.URL+"/admin/import", map[string]string{
		"type": "unknown",
	}, nil, cookie)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	body := readTestBody(t, resp)
	if !strings.Contains(body, "Unknown import type") {
		t.Fatalf("body = %q, want Unknown import type", body)
	}
}

func TestAdminImportMissingFile(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := newMultipartImportRequest(srv.URL+"/admin/import", map[string]string{
		"type": "gongyu",
	}, nil, cookie)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	body := readTestBody(t, resp)
	if !strings.Contains(body, "Failed to read uploaded file") {
		t.Fatalf("body = %q, want Failed to read uploaded file", body)
	}
}

func TestAdminImportParseError(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := newMultipartImportRequest(srv.URL+"/admin/import", map[string]string{
		"type": "gongyu",
	}, map[string]string{
		"file": "not json",
	}, cookie)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	body := readTestBody(t, resp)
	if !strings.Contains(body, "Failed to parse:") {
		t.Fatalf("body = %q, want Failed to parse", body)
	}
}

func TestAdminImportSuccessDefaultsMissingFields(t *testing.T) {
	var imported []model.Bookmark
	store := &mockStore{
		bulkImportBookmarks: func(ctx context.Context, bookmarks []model.Bookmark) (int, int, error) {
			imported = append([]model.Bookmark(nil), bookmarks...)
			return len(bookmarks), 0, nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	before := time.Now().UTC()
	req, err := newMultipartImportRequest(srv.URL+"/admin/import", map[string]string{
		"type": "gongyu",
	}, map[string]string{
		"file": `{"bookmarks":[{"url":"https://example.com","title":"Example"}]}`,
	}, cookie)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)
	after := time.Now().UTC()

	if resp.StatusCode != http.StatusFound {
		t.Fatalf("status = %d, want 302", resp.StatusCode)
	}
	if loc := resp.Header.Get("Location"); loc != "/admin/settings?tab=import" {
		t.Fatalf("Location = %q, want /admin/settings?tab=import", loc)
	}

	foundFlash := false
	for _, c := range resp.Cookies() {
		if c.Name == flashCookieName && c.Value == "Imported 1 bookmarks, skipped 0 duplicates" {
			foundFlash = true
			break
		}
	}
	if !foundFlash {
		t.Fatal("response did not set expected flash cookie")
	}

	if len(imported) != 1 {
		t.Fatalf("len(imported) = %d, want 1", len(imported))
	}

	bookmark := imported[0]
	if bookmark.ShortUrl == "" || len(bookmark.ShortUrl) != 8 {
		t.Fatalf("ShortUrl = %q, want generated 8-char value", bookmark.ShortUrl)
	}
	if bookmark.CreatedAt.IsZero() {
		t.Fatal("CreatedAt is zero, want populated timestamp")
	}
	if bookmark.UpdatedAt.IsZero() {
		t.Fatal("UpdatedAt is zero, want populated timestamp")
	}
	if !bookmark.CreatedAt.Equal(bookmark.UpdatedAt) {
		t.Fatalf("CreatedAt = %v, UpdatedAt = %v, want equal timestamps", bookmark.CreatedAt, bookmark.UpdatedAt)
	}
	if bookmark.CreatedAt.Before(before.Add(-time.Second)) || bookmark.CreatedAt.After(after.Add(time.Second)) {
		t.Fatalf("CreatedAt = %v, want between %v and %v", bookmark.CreatedAt, before, after)
	}
}

func TestAdminImportStoreError(t *testing.T) {
	store := &mockStore{
		bulkImportBookmarks: func(ctx context.Context, bookmarks []model.Bookmark) (int, int, error) {
			return 0, 0, context.DeadlineExceeded
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := newMultipartImportRequest(srv.URL+"/admin/import", map[string]string{
		"type": "gongyu",
	}, map[string]string{
		"file": `{"bookmarks":[{"url":"https://example.com","title":"Example","short_url":"abc12345"}]}`,
	}, cookie)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	body := readTestBody(t, resp)
	if !strings.Contains(body, "Import failed: context deadline exceeded") {
		t.Fatalf("body = %q, want Import failed", body)
	}
}

func newMultipartImportRequest(rawURL string, fields map[string]string, files map[string]string, cookie *http.Cookie) (*http.Request, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return nil, err
		}
	}
	if cookie != nil {
		if err := writer.WriteField("_csrf", csrfToken(cookie.Value, testEncKey)); err != nil {
			return nil, err
		}
	}
	for fieldName, content := range files {
		part, err := writer.CreateFormFile(fieldName, fieldName+".txt")
		if err != nil {
			return nil, err
		}
		if _, err := part.Write([]byte(content)); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, rawURL, &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if cookie != nil {
		req.AddCookie(cookie)
	}
	return req, nil
}

func readTestBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	var buf bytes.Buffer
	if _, err := buf.ReadFrom(resp.Body); err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}
	return buf.String()
}

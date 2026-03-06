package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

func TestAdminExportHTML(t *testing.T) {
	store := &mockStore{
		allBookmarks: func(ctx context.Context) ([]model.Bookmark, error) {
			return []model.Bookmark{
				{ID: 1, Title: "Test", Url: "https://example.com", CreatedAt: time.Now()},
			}, nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("GET", srv.URL+"/admin/export?format=html", nil)
	if err != nil { t.Fatal(err) }
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	cd := resp.Header.Get("Content-Disposition")
	if !strings.Contains(cd, "bookmarks_") {
		t.Errorf("Content-Disposition = %q, want to contain bookmarks_", cd)
	}
}

func TestAdminExportJSON(t *testing.T) {
	store := &mockStore{
		allBookmarks: func(ctx context.Context) ([]model.Bookmark, error) {
			return []model.Bookmark{
				{ID: 1, Title: "Test", Url: "https://example.com", CreatedAt: time.Now()},
			}, nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("GET", srv.URL+"/admin/export?format=json", nil)
	if err != nil { t.Fatal(err) }
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Errorf("content-type = %q, want application/json", ct)
	}
}

func TestAdminExportInvalidFormat(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("GET", srv.URL+"/admin/export?format=csv", nil)
	if err != nil { t.Fatal(err) }
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 400 {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

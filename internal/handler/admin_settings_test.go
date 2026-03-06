package handler

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/angristan/gongyu/internal/model"
)

func TestAdminSettings(t *testing.T) {
	store := &mockStore{
		getSetting: func(ctx context.Context, key string) (model.Setting, error) {
			return model.Setting{}, sql.ErrNoRows
		},
		countBookmarks: func(ctx context.Context) (int64, error) {
			return 5, nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("GET", srv.URL+"/admin/settings", nil)
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
}

func TestAdminUpdateSettings(t *testing.T) {
	saved := map[string]string{}
	store := &mockStore{
		getSetting: func(ctx context.Context, key string) (model.Setting, error) {
			return model.Setting{}, sql.ErrNoRows
		},
		upsertSetting: func(ctx context.Context, key, value string, encrypted int64) error {
			saved[key] = value
			return nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(url.Values{
		"mastodon_instance": {"https://mastodon.social"},
		"bluesky_handle":    {"user.bsky.social"},
	}, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/settings", strings.NewReader(form.Encode()))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(cookie)
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	if saved["mastodon_instance"] != "https://mastodon.social" {
		t.Errorf("mastodon_instance = %q, want https://mastodon.social", saved["mastodon_instance"])
	}
	if saved["bluesky_handle"] != "user.bsky.social" {
		t.Errorf("bluesky_handle = %q, want user.bsky.social", saved["bluesky_handle"])
	}
}

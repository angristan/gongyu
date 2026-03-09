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
	if err != nil {
		t.Fatal(err)
	}
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
		upsertSetting: func(ctx context.Context, key, value string, encrypted bool) error {
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
	if err != nil {
		t.Fatal(err)
	}
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

func TestAdminUpdateSettingsOnlyWritesSubmittedKeys(t *testing.T) {
	saved := map[string]string{}
	store := &mockStore{
		upsertSetting: func(ctx context.Context, key, value string, encrypted bool) error {
			saved[key] = value
			return nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(url.Values{
		"tab":                {"twitter"},
		"twitter_api_key":    {"api-key"},
		"twitter_api_secret": {"••••••••"},
	}, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/settings", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
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
	if len(saved) != 1 {
		t.Fatalf("saved keys = %v, want only one submitted key", saved)
	}
	if saved["twitter_api_key"] != "api-key" {
		t.Errorf("twitter_api_key = %q, want api-key", saved["twitter_api_key"])
	}
	if _, ok := saved["mastodon_instance"]; ok {
		t.Errorf("mastodon_instance should not be overwritten when omitted")
	}
	if _, ok := saved["bluesky_handle"]; ok {
		t.Errorf("bluesky_handle should not be overwritten when omitted")
	}
	if _, ok := saved["twitter_api_secret"]; ok {
		t.Errorf("twitter_api_secret should not be overwritten when left as placeholder")
	}
}

func TestAdminUpdateSettingsClearsSubmittedEmptyValue(t *testing.T) {
	saved := map[string]string{}
	store := &mockStore{
		upsertSetting: func(ctx context.Context, key, value string, encrypted bool) error {
			saved[key] = value
			return nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(url.Values{
		"tab":               {"mastodon"},
		"mastodon_instance": {""},
	}, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/settings", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
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
	if value, ok := saved["mastodon_instance"]; !ok || value != "" {
		t.Errorf("mastodon_instance = %q, want submitted empty value to clear the setting", value)
	}
	if _, ok := saved["twitter_api_key"]; ok {
		t.Errorf("twitter_api_key should not be overwritten when omitted")
	}
}

package handler

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/view"
)

var settingsKeys = []struct {
	Key       string
	Encrypted bool
}{
	{"twitter_api_key", false},
	{"twitter_api_secret", true},
	{"twitter_access_token", false},
	{"twitter_access_secret", true},
	{"mastodon_instance", false},
	{"mastodon_access_token", true},
	{"bluesky_handle", false},
	{"bluesky_app_password", true},
}

func (h *Handler) AdminSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	settings := map[string]string{}
	for _, s := range settingsKeys {
		val := model.GetSetting(ctx, h.Store, s.Key, h.EncKey)
		if s.Encrypted && val != "" {
			settings[s.Key] = "••••••••"
		} else {
			settings[s.Key] = val
		}
	}

	total, err := h.Store.CountBookmarks(ctx)
	if err != nil {
		slog.Error("settings: count bookmarks", "error", err)
	}

	h.render(w, r, view.AdminSettingsPage(view.SettingsData{
		LayoutData:     h.layoutData(w, r),
		Settings:       settings,
		Tab:            r.URL.Query().Get("tab"),
		TotalBookmarks: total,
	}))
}

func (h *Handler) AdminUpdateSettings(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	ctx := r.Context()

	for _, s := range settingsKeys {
		if _, submitted := r.PostForm[s.Key]; !submitted {
			continue
		}

		val := strings.TrimSpace(r.PostFormValue(s.Key))
		if s.Encrypted && val == "••••••••" {
			continue
		}
		if err := model.SetSetting(ctx, h.Store, s.Key, val, s.Encrypted, h.EncKey); err != nil {
			slog.Error("failed to save setting", "key", s.Key, "error", err)
		}
	}

	setFlash(w, "Settings saved")
	tab := r.FormValue("tab")
	if tab != "" {
		http.Redirect(w, r, "/admin/settings?tab="+tab, http.StatusFound)
	} else {
		http.Redirect(w, r, "/admin/settings", http.StatusFound)
	}
}

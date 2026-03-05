package handler

import (
	"net/http"
	"strings"

	"github.com/stanislas/gongyu/internal/model"
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

	total, _ := h.Store.CountBookmarks(ctx)

	h.render(w, r, "admin_settings.html", map[string]any{
		"Title":          "Settings",
		"Settings":       settings,
		"Tab":            r.URL.Query().Get("tab"),
		"TotalBookmarks": total,
	})
}

func (h *Handler) AdminUpdateSettings(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	ctx := r.Context()

	for _, s := range settingsKeys {
		val := strings.TrimSpace(r.FormValue(s.Key))
		if s.Encrypted && val == "••••••••" {
			continue
		}
		model.SetSetting(ctx, h.Store, s.Key, val, s.Encrypted, h.EncKey)
	}

	setFlash(w, "Settings saved")
	tab := r.FormValue("tab")
	if tab != "" {
		http.Redirect(w, r, "/admin/settings?tab="+tab, http.StatusFound)
	} else {
		http.Redirect(w, r, "/admin/settings", http.StatusFound)
	}
}

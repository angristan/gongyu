package handler

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/social"
	"github.com/angristan/gongyu/internal/view"
)

func (h *Handler) AdminSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	values := model.GetSettings(ctx, h.Store, social.Keys(), h.EncKey)

	settings := make(map[string]string, len(social.SettingDefs()))
	for _, s := range social.SettingDefs() {
		val := values[s.Key]
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

	for _, s := range social.SettingDefs() {
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

package handler

import (
	"net/http"

	"github.com/stanislas/gongyu/internal/auth"
	"github.com/stanislas/gongyu/internal/db"
	"github.com/stanislas/gongyu/internal/social"
)

func (h *Handler) Bookmarklet(w http.ResponseWriter, r *http.Request) {
	if auth.UserFromContext(r.Context()) == nil {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}

	prefillURL := r.URL.Query().Get("url")

	var existing *db.Bookmark
	if prefillURL != "" {
		if b, err := h.Store.GetBookmarkByURL(r.Context(), prefillURL); err == nil {
			existing = &b
		}
	}

	hasSocial := social.HasSocialProviders(r.Context(), h.Store, h.EncKey)

	h.render(w, r, "bookmarklet.html", map[string]any{
		"Title":        "Add Bookmark",
		"PrefillURL":   prefillURL,
		"PrefillTitle": r.URL.Query().Get("title"),
		"PrefillDesc":  r.URL.Query().Get("description"),
		"Source":       r.URL.Query().Get("source"),
		"Existing":     existing,
		"HasSocial":    hasSocial,
	})
}

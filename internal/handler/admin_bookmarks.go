package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/social"
	"github.com/angristan/gongyu/internal/thumbnail"
	"github.com/angristan/gongyu/internal/title"
)

func (h *Handler) AdminBookmarks(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}

	result, err := h.Store.SearchBookmarks(r.Context(), query, page, 20)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.render(w, r, "admin_bookmarks.html", map[string]any{
		"Title":     "Bookmarks",
		"Bookmarks": result.Bookmarks,
		"Page":      result.CurrentPage,
		"LastPage":  result.LastPage,
		"Total":     result.Total,
		"Query":     query,
	})
}

func (h *Handler) AdminCreateBookmarkPage(w http.ResponseWriter, r *http.Request) {
	hasSocial := social.HasSocialProviders(r.Context(), h.Store, h.EncKey)
	h.render(w, r, "admin_bookmark_form.html", map[string]any{
		"Title":        "Add Bookmark",
		"IsCreate":     true,
		"HasSocial":    hasSocial,
		"PrefillURL":   r.URL.Query().Get("url"),
		"PrefillTitle": r.URL.Query().Get("title"),
	})
}

func (h *Handler) AdminCreateBookmark(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	bookmarkURL := strings.TrimSpace(r.FormValue("url"))
	bookmarkTitle := strings.TrimSpace(r.FormValue("title"))
	description := strings.TrimSpace(r.FormValue("description"))
	shareToSocial := r.FormValue("share") == "on"

	var errors []string
	if bookmarkURL == "" {
		errors = append(errors, "URL is required")
	}
	if bookmarkTitle == "" {
		errors = append(errors, "Title is required")
	}
	if len(errors) > 0 {
		h.render(w, r, "admin_bookmark_form.html", map[string]any{
			"Title": "Add Bookmark", "IsCreate": true, "Errors": errors,
			"Form": map[string]string{"url": bookmarkURL, "title": bookmarkTitle, "description": description},
		})
		return
	}

	if existing, err := h.Store.GetBookmarkByURL(r.Context(), bookmarkURL); err == nil {
		h.render(w, r, "admin_bookmark_form.html", map[string]any{
			"Title": "Add Bookmark", "IsCreate": true,
			"Errors": []string{"A bookmark with this URL already exists."}, "Existing": existing,
			"Form": map[string]string{"url": bookmarkURL, "title": bookmarkTitle, "description": description},
		})
		return
	}

	bookmarkTitle = title.Clean(bookmarkTitle)
	shortURL, _ := model.UniqueShortURL(r.Context(), h.Store)
	now := time.Now().UTC()

	b, err := h.Store.CreateBookmark(r.Context(), model.CreateBookmarkParams{
		ShortUrl:    shortURL,
		Url:         bookmarkURL,
		Title:       bookmarkTitle,
		Description: description,
		CreatedAt:   now,
		UpdatedAt:   now,
	})
	if err != nil {
		h.render(w, r, "admin_bookmark_form.html", map[string]any{
			"Title": "Add Bookmark", "IsCreate": true,
			"Errors": []string{"Failed to create bookmark: " + err.Error()},
			"Form":   map[string]string{"url": bookmarkURL, "title": bookmarkTitle, "description": description},
		})
		return
	}

	// Fetch thumbnail in background
	go func() {
		meta, err := thumbnail.FetchMetadata(r.Context(), bookmarkURL)
		if err == nil && meta.OGImage != "" {
			if err := h.Store.UpdateBookmark(r.Context(), model.UpdateBookmarkParams{
				ID: b.ID, Url: b.Url, Title: b.Title, Description: b.Description,
				ThumbnailUrl: meta.OGImage, ShaarliShortUrl: b.ShaarliShortUrl,
				UpdatedAt: time.Now().UTC(),
			}); err != nil {
				log.Printf("failed to update thumbnail: %v", err)
			}
		}
	}()

	if shareToSocial {
		social.ShareBookmark(r.Context(), h.Store, h.EncKey, &b)
	}

	if r.FormValue("source") == "bookmarklet" {
		h.render(w, r, "bookmarklet_saved.html", map[string]any{"Bookmark": b})
		return
	}

	setFlash(w, "Bookmark created successfully")
	http.Redirect(w, r, "/admin/bookmarks", http.StatusFound)
}

func (h *Handler) AdminEditBookmarkPage(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	b, err := h.Store.GetBookmarkByID(r.Context(), id)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	h.render(w, r, "admin_bookmark_form.html", map[string]any{
		"Title": "Edit Bookmark", "IsCreate": false, "Bookmark": b,
		"Form": map[string]string{"url": b.Url, "title": b.Title, "description": b.Description},
	})
}

func (h *Handler) AdminUpdateBookmark(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	b, err := h.Store.GetBookmarkByID(r.Context(), id)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	if err = r.ParseForm(); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	err = h.Store.UpdateBookmark(r.Context(), model.UpdateBookmarkParams{
		ID:              b.ID,
		Url:             strings.TrimSpace(r.FormValue("url")),
		Title:           strings.TrimSpace(r.FormValue("title")),
		Description:     strings.TrimSpace(r.FormValue("description")),
		ThumbnailUrl:    b.ThumbnailUrl,
		ShaarliShortUrl: b.ShaarliShortUrl,
		UpdatedAt:       time.Now().UTC(),
	})
	if err != nil {
		h.render(w, r, "admin_bookmark_form.html", map[string]any{
			"Title": "Edit Bookmark", "IsCreate": false, "Bookmark": b,
			"Errors": []string{"Failed to update bookmark: " + err.Error()},
			"Form":   map[string]string{"url": r.FormValue("url"), "title": r.FormValue("title"), "description": r.FormValue("description")},
		})
		return
	}

	setFlash(w, "Bookmark updated successfully")
	http.Redirect(w, r, "/admin/bookmarks", http.StatusFound)
}

func (h *Handler) AdminDeleteBookmark(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err := h.Store.DeleteBookmark(r.Context(), id); err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	setFlash(w, "Bookmark deleted")
	http.Redirect(w, r, "/admin/bookmarks", http.StatusFound)
}

func (h *Handler) AdminDeleteAllBookmarks(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if r.FormValue("confirmation") != "DELETE ALL BOOKMARKS" {
		setFlash(w, "Confirmation text did not match")
		http.Redirect(w, r, "/admin/settings?tab=danger", http.StatusFound)
		return
	}
	count, _ := h.Store.DeleteAllBookmarks(r.Context())
	setFlash(w, strconv.FormatInt(count, 10)+" bookmarks deleted")
	http.Redirect(w, r, "/admin/settings?tab=danger", http.StatusFound)
}

func (h *Handler) FetchMetadataAPI(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		h.jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "URL is required"})
		return
	}

	meta, err := thumbnail.FetchMetadata(r.Context(), req.URL)
	if err != nil {
		h.jsonResponse(w, http.StatusOK, map[string]string{"title": "", "description": "", "og_image": ""})
		return
	}

	meta.Title = title.Clean(meta.Title)
	h.jsonResponse(w, http.StatusOK, meta)
}

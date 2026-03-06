package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/social"
	"github.com/angristan/gongyu/internal/thumbnail"
	"github.com/angristan/gongyu/internal/title"
	"github.com/angristan/gongyu/internal/view"
)

func (h *Handler) AdminBookmarks(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	page, _ := strconv.Atoi(r.URL.Query().Get("page")) //nolint:errcheck // defaults to 0, clamped below
	if page < 1 {
		page = 1
	}

	result, err := h.Store.SearchBookmarks(r.Context(), query, page, 20)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.render(w, r, view.AdminBookmarksPage(view.AdminBookmarksData{
		LayoutData: h.layoutData(w, r),
		Bookmarks:  result.Bookmarks,
		Page:       result.CurrentPage,
		LastPage:   result.LastPage,
		Total:      result.Total,
		Query:      query,
	}))
}

func (h *Handler) AdminCreateBookmarkPage(w http.ResponseWriter, r *http.Request) {
	hasSocial := social.HasSocialProviders(r.Context(), h.Store, h.EncKey)
	h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
		LayoutData: h.layoutData(w, r),
		IsCreate:   true,
		HasSocial:  hasSocial,
		Form:       map[string]string{"url": r.URL.Query().Get("url"), "title": r.URL.Query().Get("title")},
	}))
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
		h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
			LayoutData: h.layoutData(w, r),
			IsCreate:   true,
			Errors:     errors,
			Form:       map[string]string{"url": bookmarkURL, "title": bookmarkTitle, "description": description},
		}))
		return
	}

	if existing, err := h.Store.GetBookmarkByURL(r.Context(), bookmarkURL); err == nil {
		h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
			LayoutData: h.layoutData(w, r),
			IsCreate:   true,
			Errors:     []string{"A bookmark with this URL already exists."},
			Existing:   &existing,
			Form:       map[string]string{"url": bookmarkURL, "title": bookmarkTitle, "description": description},
		}))
		return
	}

	bookmarkTitle = title.Clean(bookmarkTitle)
	shortURL, err := model.UniqueShortURL(r.Context(), h.Store)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
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
		h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
			LayoutData: h.layoutData(w, r),
			IsCreate:   true,
			Errors:     []string{"Failed to create bookmark: " + err.Error()},
			Form:       map[string]string{"url": bookmarkURL, "title": bookmarkTitle, "description": description},
		}))
		return
	}

	// Fetch thumbnail in background (detached from request context)
	h.Background.Do(func() {
		ctx := context.Background()
		meta, err := thumbnail.FetchMetadata(ctx, bookmarkURL)
		if err == nil && meta.OGImage != "" {
			if err := h.Store.UpdateBookmark(ctx, model.UpdateBookmarkParams{
				ID: b.ID, Url: b.Url, Title: b.Title, Description: b.Description,
				ThumbnailUrl: meta.OGImage, ShaarliShortUrl: b.ShaarliShortUrl,
				UpdatedAt: time.Now().UTC(),
			}); err != nil {
				slog.Error("failed to update thumbnail", "error", err)
			}
		}
	})

	if shareToSocial {
		social.ShareBookmark(h.Background, h.Store, h.EncKey, &b)
	}

	if r.FormValue("source") == "bookmarklet" {
		h.render(w, r, view.BookmarkletSavedPage(view.BookmarkletSavedData{Bookmark: b}))
		return
	}

	setFlash(w, "Bookmark created successfully")
	http.Redirect(w, r, "/admin/bookmarks", http.StatusFound)
}

func (h *Handler) AdminEditBookmarkPage(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64) //nolint:errcheck // invalid id → 0 → not found
	b, err := h.Store.GetBookmarkByID(r.Context(), id)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
		LayoutData: h.layoutData(w, r),
		IsCreate:   false,
		Bookmark:   &b,
		Form:       map[string]string{"url": b.Url, "title": b.Title, "description": b.Description},
	}))
}

func (h *Handler) AdminUpdateBookmark(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64) //nolint:errcheck // invalid id → 0 → not found
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
		h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
			LayoutData: h.layoutData(w, r),
			IsCreate:   false,
			Bookmark:   &b,
			Errors:     []string{"Failed to update bookmark: " + err.Error()},
			Form:       map[string]string{"url": r.FormValue("url"), "title": r.FormValue("title"), "description": r.FormValue("description")},
		}))
		return
	}

	setFlash(w, "Bookmark updated successfully")
	http.Redirect(w, r, "/admin/bookmarks", http.StatusFound)
}

func (h *Handler) AdminDeleteBookmark(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64) //nolint:errcheck // invalid id → 0 → not found
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
	count, err := h.Store.DeleteAllBookmarks(r.Context())
	if err != nil {
		slog.Error("failed to delete all bookmarks", "error", err)
		setFlash(w, "Failed to delete bookmarks")
		http.Redirect(w, r, "/admin/settings?tab=danger", http.StatusFound)
		return
	}
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

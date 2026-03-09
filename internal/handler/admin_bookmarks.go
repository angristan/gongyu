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
	"github.com/angristan/gongyu/internal/title"
	"github.com/angristan/gongyu/internal/view"
)

const defaultPerPage = 20

// searchParams extracts search query and page number from the request.
func searchParams(r *http.Request) (query string, page int) {
	query = r.URL.Query().Get("q")
	page, _ = strconv.Atoi(r.URL.Query().Get("page")) //nolint:errcheck // defaults to 0, clamped below
	if page < 1 {
		page = 1
	}
	return
}

func (h *Handler) AdminBookmarks(w http.ResponseWriter, r *http.Request) {
	query, page := searchParams(r)

	result, err := h.Store.SearchBookmarks(r.Context(), query, page, defaultPerPage)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.render(w, r, view.AdminBookmarksPage(view.BookmarkListData{
		LayoutData: h.layoutData(w, r),
		Bookmarks:  result.Bookmarks,
		Page:       result.CurrentPage,
		LastPage:   result.LastPage,
		Total:      result.Total,
		Query:      query,
	}))
}

func (h *Handler) AdminCreateBookmarkPage(w http.ResponseWriter, r *http.Request) {
	hasSocial := social.HasProviders(h.socialSettings(r.Context()))
	h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
		LayoutData: h.layoutData(w, r),
		IsCreate:   true,
		HasSocial:  hasSocial,
		Form:       map[string]string{"url": r.URL.Query().Get("url"), "title": r.URL.Query().Get("title")},
	}))
}

func (h *Handler) AdminCreateBookmark(w http.ResponseWriter, r *http.Request) {
	form, err := parseBookmarkForm(r)
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	formValues := map[string]string{"url": form.URL, "title": form.Title, "description": form.Description}

	if errors := form.Validate(); len(errors) > 0 {
		h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
			LayoutData: h.layoutData(w, r),
			IsCreate:   true,
			Errors:     errors,
			Form:       formValues,
		}))
		return
	}

	if existing, err := h.Store.GetBookmarkByURL(r.Context(), form.URL); err == nil {
		h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
			LayoutData: h.layoutData(w, r),
			IsCreate:   true,
			Errors:     []string{"A bookmark with this URL already exists."},
			Existing:   &existing,
			Form:       formValues,
		}))
		return
	}

	form.Title = title.Clean(form.Title)
	shortURL, err := model.UniqueShortURL(r.Context(), h.Store)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	now := time.Now().UTC()

	b, err := h.Store.CreateBookmark(r.Context(), model.CreateBookmarkParams{
		ShortUrl:    shortURL,
		Url:         form.URL,
		Title:       form.Title,
		Description: form.Description,
		CreatedAt:   now,
		UpdatedAt:   now,
	})
	if err != nil {
		h.render(w, r, view.AdminBookmarkFormPage(view.BookmarkFormData{
			LayoutData: h.layoutData(w, r),
			IsCreate:   true,
			Errors:     []string{"Failed to create bookmark: " + err.Error()},
			Form:       formValues,
		}))
		return
	}

	// Fetch thumbnail in background (detached from request context)
	bookmarkURL := form.URL
	h.Background.Do(func(ctx context.Context) {
		meta, err := h.ThumbnailFetcher.FetchMetadata(ctx, bookmarkURL)
		if err == nil && meta.OGImage != "" {
			if err := h.Store.UpdateBookmarkThumbnail(ctx, b.ID, meta.OGImage); err != nil {
				slog.Error("failed to update thumbnail", "error", err)
			}
		}
	})

	if form.Share {
		settings := h.socialSettings(r.Context())
		h.Background.Do(func(ctx context.Context) {
			h.SocialClient.PostAll(ctx, &b, settings)
		})
	}

	if form.Source == "bookmarklet" {
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

	form, err := parseBookmarkForm(r)
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	err = h.Store.UpdateBookmark(r.Context(), model.UpdateBookmarkParams{
		ID:              b.ID,
		Url:             form.URL,
		Title:           form.Title,
		Description:     form.Description,
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
			Form:       map[string]string{"url": form.URL, "title": form.Title, "description": form.Description},
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
	bookmarkURL, err := metadataRequestURL(r)
	if err != nil || bookmarkURL == "" {
		h.jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "URL is required"})
		return
	}

	meta, err := h.ThumbnailFetcher.FetchMetadata(r.Context(), bookmarkURL)
	if err != nil {
		h.jsonResponse(w, http.StatusOK, map[string]string{"title": "", "description": "", "og_image": ""})
		return
	}

	meta.Title = title.Clean(meta.Title)
	h.jsonResponse(w, http.StatusOK, meta)
}

func metadataRequestURL(r *http.Request) (string, error) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var req struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return "", err
		}
		return strings.TrimSpace(req.URL), nil
	}

	if err := r.ParseForm(); err != nil {
		return "", err
	}
	return strings.TrimSpace(r.FormValue("url")), nil
}

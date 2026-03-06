package handler

import (
	"database/sql"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/angristan/gongyu/internal/feed"
	"github.com/angristan/gongyu/internal/view"
)

func (h *Handler) Home(w http.ResponseWriter, r *http.Request) {
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

	h.render(w, r, view.HomePage(view.HomeData{
		LayoutData: h.layoutData(w, r),
		Bookmarks:  result.Bookmarks,
		Page:       result.CurrentPage,
		LastPage:   result.LastPage,
		Total:      result.Total,
		Query:      query,
	}))
}

func (h *Handler) ShowBookmark(w http.ResponseWriter, r *http.Request) {
	shortURL := r.PathValue("shortURL")
	b, err := h.Store.GetBookmarkByShortURL(r.Context(), shortURL)
	if err != nil {
		if err == sql.ErrNoRows {
			http.NotFound(w, r)
			return
		}
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.render(w, r, view.BookmarkPage(view.BookmarkPageData{
		LayoutData: h.layoutData(w, r),
		Bookmark:   b,
	}))
}

func (h *Handler) HandleLegacyShaarliURL(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	b, err := h.Store.GetBookmarkByShaarliHash(r.Context(), hash)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	http.Redirect(w, r, "/b/"+b.ShortUrl, http.StatusMovedPermanently)
}

func (h *Handler) Feed(w http.ResponseWriter, r *http.Request) {
	bookmarks, err := h.Store.RecentBookmarks(r.Context(), 50)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	xml, err := feed.GenerateAtom(h.BaseURL, bookmarks)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/atom+xml; charset=utf-8")
	if _, err := w.Write(xml); err != nil {
		slog.Error("failed to write feed", "error", err)
	}
}

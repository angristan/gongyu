package handler

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/stanislas/gongyu/internal/feed"
)

func (h *Handler) Home(w http.ResponseWriter, r *http.Request) {
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

	h.render(w, r, "home.html", map[string]any{
		"Title":     "Gongyu",
		"Bookmarks": result.Bookmarks,
		"Page":      result.CurrentPage,
		"LastPage":  result.LastPage,
		"Total":     result.Total,
		"Query":     query,
	})
}

func (h *Handler) ShowBookmark(w http.ResponseWriter, r *http.Request) {
	shortURL := chi.URLParam(r, "shortURL")
	b, err := h.Store.GetBookmarkByShortURL(r.Context(), shortURL)
	if err != nil {
		if err == sql.ErrNoRows {
			http.NotFound(w, r)
			return
		}
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.render(w, r, "bookmark.html", map[string]any{
		"Title":    b.Title,
		"Bookmark": b,
	})
}

func (h *Handler) HandleLegacyShaarliURL(w http.ResponseWriter, r *http.Request) {
	hash := chi.URLParam(r, "hash")
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
	w.Write(xml)
}

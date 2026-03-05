package handler

import (
	"net/http"

	"github.com/angristan/gongyu/internal/auth"
)

// Routes returns the configured HTTP router.
func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()

	// Static files
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(h.StaticFS))))

	// Public routes
	mux.HandleFunc("GET /{$}", h.Home)
	mux.HandleFunc("GET /b/{shortURL}", h.ShowBookmark)
	mux.HandleFunc("GET /search", h.Home)
	mux.HandleFunc("GET /feed", h.Feed)
	mux.HandleFunc("GET /shaare/{hash}", h.HandleLegacyShaarliURL)

	// Auth routes (guest-only)
	mux.Handle("GET /login", auth.RequireGuest(http.HandlerFunc(h.LoginPage)))
	mux.Handle("POST /login", auth.RequireGuest(http.HandlerFunc(h.LoginSubmit)))

	mux.HandleFunc("GET /setup", h.SetupPage)
	mux.HandleFunc("POST /setup", h.SetupSubmit)
	mux.HandleFunc("POST /logout", h.Logout)

	// Bookmarklet
	mux.HandleFunc("GET /bookmarklet", h.Bookmarklet)

	// Admin routes (auth-required)
	mux.Handle("GET /admin/dashboard", auth.RequireAuth(http.HandlerFunc(h.AdminDashboard)))

	mux.Handle("GET /admin/bookmarks", auth.RequireAuth(http.HandlerFunc(h.AdminBookmarks)))
	mux.Handle("GET /admin/bookmarks/create", auth.RequireAuth(http.HandlerFunc(h.AdminCreateBookmarkPage)))
	mux.Handle("POST /admin/bookmarks", auth.RequireAuth(http.HandlerFunc(h.AdminCreateBookmark)))
	mux.Handle("GET /admin/bookmarks/{id}/edit", auth.RequireAuth(http.HandlerFunc(h.AdminEditBookmarkPage)))
	mux.Handle("POST /admin/bookmarks/{id}", auth.RequireAuth(http.HandlerFunc(h.AdminUpdateBookmark)))
	mux.Handle("POST /admin/bookmarks/{id}/delete", auth.RequireAuth(http.HandlerFunc(h.AdminDeleteBookmark)))
	mux.Handle("POST /admin/bookmarks/delete-all", auth.RequireAuth(http.HandlerFunc(h.AdminDeleteAllBookmarks)))
	mux.Handle("POST /admin/bookmarks/fetch-metadata", auth.RequireAuth(http.HandlerFunc(h.FetchMetadataAPI)))

	mux.Handle("GET /admin/import", auth.RequireAuth(http.HandlerFunc(h.AdminImportPage)))
	mux.Handle("POST /admin/import", auth.RequireAuth(http.HandlerFunc(h.AdminImport)))
	mux.Handle("GET /admin/export", auth.RequireAuth(http.HandlerFunc(h.AdminExport)))

	mux.Handle("GET /admin/settings", auth.RequireAuth(http.HandlerFunc(h.AdminSettings)))
	mux.Handle("POST /admin/settings", auth.RequireAuth(http.HandlerFunc(h.AdminUpdateSettings)))

	// Wrap with global middleware
	var handler http.Handler = mux
	handler = auth.Middleware(h.Store)(handler)
	handler = recoverMiddleware(handler)
	handler = logMiddleware(handler)

	return handler
}

package handler

import (
	"net/http"

	"github.com/angristan/gongyu/internal/auth"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// Routes returns the configured HTTP router.
func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()

	admin := auth.RequireAuth

	// Static files with immutable cache headers (cache-busted via ?v= query param)
	mux.Handle("GET /static/", cacheControl(http.StripPrefix("/static/", http.FileServer(http.FS(h.StaticFS)))))

	// Health check
	mux.HandleFunc("GET /healthz", h.Healthz)

	// Public routes
	mux.HandleFunc("GET /{$}", h.Home)
	mux.HandleFunc("GET /b/{shortURL}", h.ShowBookmark)
	mux.HandleFunc("GET /search", h.Home)
	mux.HandleFunc("GET /feed", h.Feed)
	mux.HandleFunc("GET /shaare/{hash}", h.HandleLegacyShaarliURL)

	// Auth routes (guest-only)
	mux.Handle("GET /login", auth.RequireGuest(http.HandlerFunc(h.LoginPage)))
	mux.Handle("POST /login", auth.RequireGuest(loginRateLimit(h.loginLimiter, http.HandlerFunc(h.LoginSubmit))))

	mux.HandleFunc("GET /setup", h.SetupPage)
	mux.HandleFunc("POST /setup", h.SetupSubmit)
	mux.HandleFunc("POST /logout", h.Logout)

	// Bookmarklet
	mux.HandleFunc("GET /bookmarklet", h.Bookmarklet)

	// Admin routes (auth-required)
	mux.Handle("GET /admin/dashboard", admin(http.HandlerFunc(h.AdminDashboard)))

	mux.Handle("GET /admin/bookmarks", admin(http.HandlerFunc(h.AdminBookmarks)))
	mux.Handle("GET /admin/bookmarks/create", admin(http.HandlerFunc(h.AdminCreateBookmarkPage)))
	mux.Handle("POST /admin/bookmarks", admin(http.HandlerFunc(h.AdminCreateBookmark)))
	mux.Handle("GET /admin/bookmarks/{id}/edit", admin(http.HandlerFunc(h.AdminEditBookmarkPage)))
	mux.Handle("POST /admin/bookmarks/{id}", admin(http.HandlerFunc(h.AdminUpdateBookmark)))
	mux.Handle("POST /admin/bookmarks/{id}/delete", admin(http.HandlerFunc(h.AdminDeleteBookmark)))
	mux.Handle("POST /admin/bookmarks/delete-all", admin(http.HandlerFunc(h.AdminDeleteAllBookmarks)))
	mux.Handle("POST /admin/bookmarks/fetch-metadata", admin(http.HandlerFunc(h.FetchMetadataAPI)))

	mux.Handle("GET /admin/import", admin(http.HandlerFunc(h.AdminImportPage)))
	mux.Handle("POST /admin/import", admin(http.HandlerFunc(h.AdminImport)))
	mux.Handle("GET /admin/export", admin(http.HandlerFunc(h.AdminExport)))

	mux.Handle("GET /admin/settings", admin(http.HandlerFunc(h.AdminSettings)))
	mux.Handle("POST /admin/settings", admin(http.HandlerFunc(h.AdminUpdateSettings)))

	// Wrap with global middleware
	var handler http.Handler = mux
	handler = h.csrfProtect(handler)
	handler = auth.Middleware(h.Store)(handler)
	handler = recoverMiddleware(handler)
	handler = logMiddleware(handler)
	handler = otelhttp.NewHandler(handler, "gongyu")

	return handler
}

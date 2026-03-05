package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/stanislas/gongyu/internal/auth"
)

// Routes returns the configured HTTP router.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))
	r.Use(auth.Middleware(h.Store))

	// Static files
	r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(http.FS(h.StaticFS))))

	// Public routes
	r.Get("/", h.Home)
	r.Get("/b/{shortURL}", h.ShowBookmark)
	r.Get("/search", h.Home) // Same handler, uses ?q= param
	r.Get("/feed", h.Feed)
	r.Get("/shaare/{hash}", h.HandleLegacyShaarliURL)

	// Auth routes
	r.Group(func(r chi.Router) {
		r.Use(auth.RequireGuest)
		r.Get("/login", h.LoginPage)
		r.Post("/login", h.LoginSubmit)
	})

	r.Get("/setup", h.SetupPage)
	r.Post("/setup", h.SetupSubmit)
	r.Post("/logout", h.Logout)

	// Bookmarklet (needs auth but separate from admin prefix)
	r.Get("/bookmarklet", h.Bookmarklet)

	// Admin routes
	r.Route("/admin", func(r chi.Router) {
		r.Use(auth.RequireAuth)

		r.Get("/dashboard", h.AdminDashboard)

		// Bookmarks
		r.Get("/bookmarks", h.AdminBookmarks)
		r.Get("/bookmarks/create", h.AdminCreateBookmarkPage)
		r.Post("/bookmarks", h.AdminCreateBookmark)
		r.Get("/bookmarks/{id}/edit", h.AdminEditBookmarkPage)
		r.Post("/bookmarks/{id}", h.AdminUpdateBookmark)
		r.Post("/bookmarks/{id}/delete", h.AdminDeleteBookmark)
		r.Post("/bookmarks/delete-all", h.AdminDeleteAllBookmarks)
		r.Post("/bookmarks/fetch-metadata", h.FetchMetadataAPI)

		// Import/Export
		r.Get("/import", h.AdminImportPage)
		r.Post("/import", h.AdminImport)
		r.Get("/export", h.AdminExport)

		// Settings
		r.Get("/settings", h.AdminSettings)
		r.Post("/settings", h.AdminUpdateSettings)
	})

	return r
}

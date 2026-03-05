package web

import (
	"net/http"

	"gongyu/internal/app"
)

func NewRouter(application *app.App) http.Handler {
	h := NewHandler(application)
	mux := http.NewServeMux()

	mux.Handle("GET /", http.HandlerFunc(h.PublicIndex))
	mux.Handle("GET /search", http.HandlerFunc(h.PublicIndex))
	mux.Handle("GET /partials/public-bookmarks", http.HandlerFunc(h.PublicPartialBookmarks))
	mux.Handle("GET /b/{shortUrl}", http.HandlerFunc(h.PublicBookmark))
	mux.Handle("GET /feed", http.HandlerFunc(h.Feed))
	mux.Handle("GET /shaare/{hash}", http.HandlerFunc(h.LegacyShaare))

	setupHandler := chain(http.HandlerFunc(h.SetupPage), requireSetupOpen(application))
	setupSubmitHandler := chain(http.HandlerFunc(h.SetupSubmit), requireSetupOpen(application), verifyCSRF)
	mux.Handle("GET /setup", setupHandler)
	mux.Handle("POST /setup", setupSubmitHandler)

	mux.Handle("GET /login", chain(http.HandlerFunc(h.LoginPage), requireGuest))
	mux.Handle("POST /login", chain(http.HandlerFunc(h.LoginSubmit), requireGuest, verifyCSRF))
	mux.Handle("GET /logout", http.HandlerFunc(h.Logout))
	mux.Handle("POST /logout", chain(http.HandlerFunc(h.Logout), verifyCSRF))
	mux.Handle("GET /bookmarklet", chain(http.HandlerFunc(h.Bookmarklet), requireAuth))

	mux.Handle("GET /admin/dashboard", chain(http.HandlerFunc(h.AdminDashboard), requireAuth))
	mux.Handle("GET /admin/bookmarks", chain(http.HandlerFunc(h.AdminBookmarks), requireAuth))
	mux.Handle("GET /partials/admin-bookmarks", chain(http.HandlerFunc(h.AdminPartialBookmarks), requireAuth))
	mux.Handle("GET /admin/bookmarks/create", chain(http.HandlerFunc(h.CreateBookmarkPage), requireAuth))
	mux.Handle("POST /admin/bookmarks", chain(http.HandlerFunc(h.CreateBookmarkSubmit), requireAuth, verifyCSRF))
	mux.Handle("GET /admin/bookmarks/{shortUrl}/edit", chain(http.HandlerFunc(h.EditBookmarkPage), requireAuth))
	mux.Handle("POST /admin/bookmarks/{shortUrl}/update", chain(http.HandlerFunc(h.UpdateBookmarkSubmit), requireAuth, verifyCSRF))
	mux.Handle("POST /admin/bookmarks/{shortUrl}/delete", chain(http.HandlerFunc(h.DeleteBookmarkSubmit), requireAuth, verifyCSRF))
	mux.Handle("POST /admin/bookmarks/all/delete", chain(http.HandlerFunc(h.DeleteAllBookmarksSubmit), requireAuth, verifyCSRF))
	mux.Handle("POST /admin/bookmarks/fetch-metadata", chain(http.HandlerFunc(h.FetchMetadataAPI), requireAuth, verifyCSRF))

	mux.Handle("GET /admin/settings", chain(http.HandlerFunc(h.SettingsPage), requireAuth))
	mux.Handle("POST /admin/settings", chain(http.HandlerFunc(h.SettingsSubmit), requireAuth, verifyCSRF))
	mux.Handle("GET /admin/import", chain(http.HandlerFunc(h.ImportPage), requireAuth))
	mux.Handle("POST /admin/import", chain(http.HandlerFunc(h.ImportSubmit), requireAuth, verifyCSRF))
	mux.Handle("GET /admin/export", chain(http.HandlerFunc(h.ExportBookmarks), requireAuth))

	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))

	return chain(mux,
		recoverer(application),
		requestLogger(application),
		methodOverride,
		sessionLoader(application),
	)
}

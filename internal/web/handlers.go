package web

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"gongyu/internal/app"
	"gongyu/internal/importer"
	"gongyu/internal/model"
	"gongyu/internal/repo"
	"gongyu/internal/service"
	"gongyu/internal/view"
)

type Handler struct {
	app *app.App
}

func NewHandler(application *app.App) *Handler {
	return &Handler{app: application}
}

func (h *Handler) PublicIndex(w http.ResponseWriter, r *http.Request) {
	bookmarks, err := h.app.Repos.Bookmarks.List(r.Context(), strings.TrimSpace(r.URL.Query().Get("q")), readIntQuery(r, "page", 1), 20)
	if err != nil {
		http.Error(w, "could not load bookmarks", http.StatusInternalServerError)
		return
	}
	flash := popFlash(w, r)
	data := view.PublicIndexData{
		App:       h.appInfo(),
		User:      currentUser(r.Context()),
		Flash:     flash,
		Bookmarks: bookmarks,
	}
	renderComponent(r.Context(), w, view.PublicIndex(data))
}

func (h *Handler) PublicPartialBookmarks(w http.ResponseWriter, r *http.Request) {
	bookmarks, err := h.app.Repos.Bookmarks.List(r.Context(), strings.TrimSpace(r.URL.Query().Get("q")), readIntQuery(r, "page", 1), 20)
	if err != nil {
		http.Error(w, "could not load bookmarks", http.StatusInternalServerError)
		return
	}
	renderComponent(r.Context(), w, view.BookmarkListPartial(bookmarks, false, ""))
}

func (h *Handler) PublicBookmark(w http.ResponseWriter, r *http.Request) {
	shortURL := r.PathValue("shortUrl")
	bookmark, err := h.app.Repos.Bookmarks.FindByShortURL(r.Context(), shortURL)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if bookmark == nil {
		http.NotFound(w, r)
		return
	}
	flash := popFlash(w, r)
	renderComponent(r.Context(), w, view.PublicBookmark(view.PublicBookmarkData{
		App:      h.appInfo(),
		User:     currentUser(r.Context()),
		Flash:    flash,
		Bookmark: *bookmark,
	}))
}

func (h *Handler) LegacyShaare(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	bookmark, err := h.app.Repos.Bookmarks.FindByShaarliShortURL(r.Context(), hash)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if bookmark == nil {
		http.NotFound(w, r)
		return
	}
	http.Redirect(w, r, "/b/"+bookmark.ShortURL, http.StatusMovedPermanently)
}

func (h *Handler) Feed(w http.ResponseWriter, r *http.Request) {
	bookmarks, err := h.app.Repos.Bookmarks.Latest(r.Context(), 50)
	if err != nil {
		http.Error(w, "could not load feed", http.StatusInternalServerError)
		return
	}
	updatedAt, err := h.app.Repos.Bookmarks.MaxUpdatedAt(r.Context())
	if err != nil {
		updatedAt = time.Now().UTC()
	}

	type atomLink struct {
		Href string `xml:"href,attr"`
		Rel  string `xml:"rel,attr,omitempty"`
	}
	type atomEntry struct {
		Title     string   `xml:"title"`
		Link      atomLink `xml:"link"`
		Via       atomLink `xml:"link"`
		ID        string   `xml:"id"`
		Updated   string   `xml:"updated"`
		Published string   `xml:"published"`
		Summary   string   `xml:"summary,omitempty"`
	}
	type atomFeed struct {
		XMLName xml.Name    `xml:"feed"`
		XmlNS   string      `xml:"xmlns,attr"`
		Title   string      `xml:"title"`
		Link    atomLink    `xml:"link"`
		Self    atomLink    `xml:"link"`
		ID      string      `xml:"id"`
		Updated string      `xml:"updated"`
		Entries []atomEntry `xml:"entry"`
	}

	entries := make([]atomEntry, 0, len(bookmarks))
	for _, bookmark := range bookmarks {
		entryURL := h.app.Config.AppURL + "/b/" + bookmark.ShortURL
		entry := atomEntry{
			Title:     bookmark.Title,
			Link:      atomLink{Href: bookmark.URL, Rel: "alternate"},
			Via:       atomLink{Href: entryURL, Rel: "via"},
			ID:        entryURL,
			Updated:   bookmark.UpdatedAt.UTC().Format(time.RFC3339),
			Published: bookmark.CreatedAt.UTC().Format(time.RFC3339),
			Summary:   bookmark.Description,
		}
		entries = append(entries, entry)
	}

	feed := atomFeed{
		XmlNS:   "http://www.w3.org/2005/Atom",
		Title:   h.app.Config.AppName,
		Link:    atomLink{Href: h.app.Config.AppURL, Rel: "alternate"},
		Self:    atomLink{Href: h.app.Config.AppURL + "/feed", Rel: "self"},
		ID:      h.app.Config.AppURL,
		Updated: updatedAt.UTC().Format(time.RFC3339),
		Entries: entries,
	}

	output, err := xml.MarshalIndent(feed, "", "  ")
	if err != nil {
		http.Error(w, "could not build feed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/atom+xml; charset=UTF-8")
	_, _ = w.Write([]byte(xml.Header + string(output)))
}

func (h *Handler) SetupPage(w http.ResponseWriter, r *http.Request) {
	flash := popFlash(w, r)
	renderComponent(r.Context(), w, view.Setup(view.SetupData{
		App:       h.appInfo(),
		Flash:     flash,
		CSRFToken: sessionDataFromContext(r.Context()).CSRFToken,
	}))
}

func (h *Handler) SetupSubmit(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.FormValue("name"))
	email := strings.TrimSpace(r.FormValue("email"))
	password := r.FormValue("password")
	confirmation := r.FormValue("password_confirmation")

	if name == "" || !looksLikeEmail(email) || len(password) < 8 || password != confirmation {
		renderComponent(r.Context(), w, view.Setup(view.SetupData{
			App:       h.appInfo(),
			Flash:     view.Flash{Error: "Please provide valid setup credentials."},
			ErrorText: "Validation failed.",
			CSRFToken: sessionDataFromContext(r.Context()).CSRFToken,
		}))
		return
	}

	hashed, err := service.HashPassword(password)
	if err != nil {
		http.Error(w, "could not hash password", http.StatusInternalServerError)
		return
	}
	user, err := h.app.Repos.Users.Create(r.Context(), name, email, hashed)
	if err != nil {
		renderComponent(r.Context(), w, view.Setup(view.SetupData{
			App:       h.appInfo(),
			Flash:     view.Flash{Error: "Could not create admin user."},
			ErrorText: err.Error(),
			CSRFToken: sessionDataFromContext(r.Context()).CSRFToken,
		}))
		return
	}

	session := sessionDataFromContext(r.Context())
	session.UserID = user.ID
	if session.CSRFToken == "" {
		session.CSRFToken = service.RandomToken(24)
	}
	_ = h.app.Sessions.Write(w, session, h.app.SecureCookies)
	setFlashSuccess(w, "Welcome to Gongyu.")
	http.Redirect(w, r, "/admin/dashboard", http.StatusFound)
}

func (h *Handler) LoginPage(w http.ResponseWriter, r *http.Request) {
	flash := popFlash(w, r)
	renderComponent(r.Context(), w, view.Login(view.LoginData{
		App:       h.appInfo(),
		Flash:     flash,
		CSRFToken: sessionDataFromContext(r.Context()).CSRFToken,
	}))
}

func (h *Handler) LoginSubmit(w http.ResponseWriter, r *http.Request) {
	email := strings.TrimSpace(r.FormValue("email"))
	password := r.FormValue("password")

	user, err := h.app.Repos.Users.FindByEmail(r.Context(), email)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if user == nil || !service.VerifyPassword(user.PasswordHash, password) {
		renderComponent(r.Context(), w, view.Login(view.LoginData{
			App:       h.appInfo(),
			ErrorText: "The provided credentials do not match our records.",
			Email:     email,
			CSRFToken: sessionDataFromContext(r.Context()).CSRFToken,
		}))
		return
	}

	session := sessionDataFromContext(r.Context())
	session.UserID = user.ID
	if session.CSRFToken == "" {
		session.CSRFToken = service.RandomToken(24)
	}
	_ = h.app.Sessions.Write(w, session, h.app.SecureCookies)
	setFlashSuccess(w, "Logged in.")
	http.Redirect(w, r, "/admin/dashboard", http.StatusFound)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	session := createAnonymousSession()
	_ = h.app.Sessions.Write(w, session, h.app.SecureCookies)
	setFlashSuccess(w, "Logged out.")
	http.Redirect(w, r, "/", http.StatusFound)
}

func (h *Handler) Bookmarklet(w http.ResponseWriter, r *http.Request) {
	if currentUser(r.Context()) == nil {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	prefillURL := strings.TrimSpace(r.URL.Query().Get("url"))
	prefillTitle := strings.TrimSpace(r.URL.Query().Get("title"))
	prefillDesc := strings.TrimSpace(r.URL.Query().Get("description"))
	bookmark, _ := h.app.Repos.Bookmarks.FindByURL(r.Context(), prefillURL)
	data := view.BookmarkFormData{
		App:            h.appInfo(),
		User:           currentUser(r.Context()),
		Bookmark:       bookmark,
		PrefillURL:     prefillURL,
		PrefillTitle:   prefillTitle,
		PrefillDesc:    prefillDesc,
		CSRFToken:      sessionDataFromContext(r.Context()).CSRFToken,
		Action:         "/admin/bookmarks",
		SubmitLabel:    "Create Bookmark",
		HasSocialShare: h.hasSocialProviders(r.Context()),
	}
	renderComponent(r.Context(), w, view.BookmarkForm(data))
}

func (h *Handler) AdminDashboard(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "30d"
	}
	stats, err := h.app.Repos.Bookmarks.DashboardStats(r.Context(), period)
	if err != nil {
		http.Error(w, "could not load stats", http.StatusInternalServerError)
		return
	}
	flash := popFlash(w, r)
	renderComponent(r.Context(), w, view.Dashboard(view.DashboardData{
		App:       h.appInfo(),
		User:      currentUser(r.Context()),
		Flash:     flash,
		Stats:     stats,
		Period:    period,
		CSRFToken: sessionDataFromContext(r.Context()).CSRFToken,
	}))
}

func (h *Handler) AdminBookmarks(w http.ResponseWriter, r *http.Request) {
	bookmarks, err := h.app.Repos.Bookmarks.List(r.Context(), strings.TrimSpace(r.URL.Query().Get("q")), readIntQuery(r, "page", 1), 20)
	if err != nil {
		http.Error(w, "could not load bookmarks", http.StatusInternalServerError)
		return
	}
	flash := popFlash(w, r)
	renderComponent(r.Context(), w, view.AdminBookmarks(view.AdminBookmarksData{
		App:       h.appInfo(),
		User:      currentUser(r.Context()),
		Flash:     flash,
		Bookmarks: bookmarks,
		CSRFToken: sessionDataFromContext(r.Context()).CSRFToken,
	}))
}

func (h *Handler) AdminPartialBookmarks(w http.ResponseWriter, r *http.Request) {
	bookmarks, err := h.app.Repos.Bookmarks.List(r.Context(), strings.TrimSpace(r.URL.Query().Get("q")), readIntQuery(r, "page", 1), 20)
	if err != nil {
		http.Error(w, "could not load bookmarks", http.StatusInternalServerError)
		return
	}
	renderComponent(r.Context(), w, view.BookmarkListPartial(bookmarks, true, sessionDataFromContext(r.Context()).CSRFToken))
}

func (h *Handler) CreateBookmarkPage(w http.ResponseWriter, r *http.Request) {
	prefillURL := strings.TrimSpace(r.URL.Query().Get("url"))
	prefillTitle := strings.TrimSpace(r.URL.Query().Get("title"))
	prefillDesc := strings.TrimSpace(r.URL.Query().Get("description"))
	bookmark, _ := h.app.Repos.Bookmarks.FindByURL(r.Context(), prefillURL)
	renderComponent(r.Context(), w, view.BookmarkForm(view.BookmarkFormData{
		App:            h.appInfo(),
		User:           currentUser(r.Context()),
		Flash:          popFlash(w, r),
		Bookmark:       bookmark,
		PrefillURL:     prefillURL,
		PrefillTitle:   prefillTitle,
		PrefillDesc:    prefillDesc,
		CSRFToken:      sessionDataFromContext(r.Context()).CSRFToken,
		Action:         "/admin/bookmarks",
		SubmitLabel:    "Create Bookmark",
		HasSocialShare: h.hasSocialProviders(r.Context()),
	}))
}

func (h *Handler) CreateBookmarkSubmit(w http.ResponseWriter, r *http.Request) {
	bookmark, err := h.readBookmarkFromRequest(r, 0)
	if err != nil {
		setFlashError(w, err.Error())
		http.Redirect(w, r, "/admin/bookmarks/create", http.StatusFound)
		return
	}

	for {
		bookmark.ShortURL = repo.GenerateShortURL()
		existing, err := h.app.Repos.Bookmarks.FindByShortURL(r.Context(), bookmark.ShortURL)
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
		if existing == nil {
			break
		}
	}

	metadata := h.app.Metadata.Fetch(r.Context(), bookmark.URL)
	if metadata.Title != "" && strings.TrimSpace(bookmark.Title) == "" {
		bookmark.Title = metadata.Title
	}
	bookmark.ThumbnailURL = service.ResolveThumbnailURL(bookmark.URL, metadata.OGImage)

	created, err := h.app.Repos.Bookmarks.Create(r.Context(), bookmark)
	if err != nil {
		setFlashError(w, "Could not create bookmark: "+err.Error())
		http.Redirect(w, r, "/admin/bookmarks/create", http.StatusFound)
		return
	}

	if r.FormValue("share_social") == "1" {
		go h.app.Social.ShareBookmark(context.Background(), *created)
	}
	setFlashSuccess(w, "Bookmark created successfully.")
	http.Redirect(w, r, "/admin/bookmarks", http.StatusFound)
}

func (h *Handler) EditBookmarkPage(w http.ResponseWriter, r *http.Request) {
	shortURL := r.PathValue("shortUrl")
	bookmark, err := h.app.Repos.Bookmarks.FindByShortURL(r.Context(), shortURL)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if bookmark == nil {
		http.NotFound(w, r)
		return
	}
	renderComponent(r.Context(), w, view.BookmarkForm(view.BookmarkFormData{
		App:            h.appInfo(),
		User:           currentUser(r.Context()),
		Flash:          popFlash(w, r),
		Bookmark:       bookmark,
		CSRFToken:      sessionDataFromContext(r.Context()).CSRFToken,
		Action:         "/admin/bookmarks/" + shortURL + "/update",
		SubmitLabel:    "Update Bookmark",
		HasSocialShare: false,
	}))
}

func (h *Handler) UpdateBookmarkSubmit(w http.ResponseWriter, r *http.Request) {
	shortURL := r.PathValue("shortUrl")
	existing, err := h.app.Repos.Bookmarks.FindByShortURL(r.Context(), shortURL)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if existing == nil {
		http.NotFound(w, r)
		return
	}
	bookmark, err := h.readBookmarkFromRequest(r, existing.ID)
	if err != nil {
		setFlashError(w, err.Error())
		http.Redirect(w, r, "/admin/bookmarks/"+shortURL+"/edit", http.StatusFound)
		return
	}
	bookmark.ID = existing.ID
	bookmark.ShortURL = existing.ShortURL
	bookmark.ShaarliShortURL = existing.ShaarliShortURL
	bookmark.CreatedAt = existing.CreatedAt

	if err := h.app.Repos.Bookmarks.Update(r.Context(), bookmark); err != nil {
		setFlashError(w, "Could not update bookmark.")
		http.Redirect(w, r, "/admin/bookmarks/"+shortURL+"/edit", http.StatusFound)
		return
	}
	setFlashSuccess(w, "Bookmark updated successfully.")
	http.Redirect(w, r, "/admin/bookmarks", http.StatusFound)
}

func (h *Handler) DeleteBookmarkSubmit(w http.ResponseWriter, r *http.Request) {
	shortURL := r.PathValue("shortUrl")
	bookmark, err := h.app.Repos.Bookmarks.FindByShortURL(r.Context(), shortURL)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if bookmark == nil {
		http.NotFound(w, r)
		return
	}
	if err := h.app.Repos.Bookmarks.Delete(r.Context(), bookmark.ID); err != nil {
		setFlashError(w, "Could not delete bookmark.")
	} else {
		setFlashSuccess(w, "Bookmark deleted successfully.")
	}
	http.Redirect(w, r, "/admin/bookmarks", http.StatusFound)
}

func (h *Handler) DeleteAllBookmarksSubmit(w http.ResponseWriter, r *http.Request) {
	count, err := h.app.Repos.Bookmarks.DeleteAll(r.Context())
	if err != nil {
		setFlashError(w, "Could not delete bookmarks.")
	} else {
		setFlashSuccess(w, fmt.Sprintf("Deleted %d bookmarks.", count))
	}
	http.Redirect(w, r, "/admin/settings", http.StatusFound)
}

func (h *Handler) FetchMetadataAPI(w http.ResponseWriter, r *http.Request) {
	if currentUser(r.Context()) == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	metadata := h.app.Metadata.Fetch(r.Context(), strings.TrimSpace(r.FormValue("url")))
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(metadata)
}

func (h *Handler) SettingsPage(w http.ResponseWriter, r *http.Request) {
	keys := []string{
		"twitter_api_key",
		"twitter_api_secret",
		"twitter_access_token",
		"twitter_access_secret",
		"mastodon_instance",
		"mastodon_access_token",
		"bluesky_handle",
		"bluesky_app_password",
	}
	values, err := h.app.Settings.Values(r.Context(), keys)
	if err != nil {
		http.Error(w, "could not load settings", http.StatusInternalServerError)
		return
	}
	count, _ := h.app.Repos.Bookmarks.TotalCount(r.Context())
	flash := popFlash(w, r)
	renderComponent(r.Context(), w, view.Settings(view.SettingsData{
		App:           h.appInfo(),
		User:          currentUser(r.Context()),
		Flash:         flash,
		CSRFToken:     sessionDataFromContext(r.Context()).CSRFToken,
		Settings:      values,
		BookmarkCount: count,
	}))
}

func (h *Handler) SettingsSubmit(w http.ResponseWriter, r *http.Request) {
	encrypted := map[string]bool{
		"twitter_api_secret":    true,
		"twitter_access_secret": true,
		"mastodon_access_token": true,
		"bluesky_app_password":  true,
		"twitter_api_key":       false,
		"twitter_access_token":  false,
		"mastodon_instance":     false,
		"bluesky_handle":        false,
	}
	for key, encrypt := range encrypted {
		if err := h.app.Settings.Set(r.Context(), key, strings.TrimSpace(r.FormValue(key)), encrypt); err != nil {
			setFlashError(w, "Could not update settings.")
			http.Redirect(w, r, "/admin/settings", http.StatusFound)
			return
		}
	}
	setFlashSuccess(w, "Settings updated successfully.")
	http.Redirect(w, r, "/admin/settings", http.StatusFound)
}

func (h *Handler) ImportSubmit(w http.ResponseWriter, r *http.Request) {
	importType := strings.TrimSpace(r.FormValue("import_type"))
	if importType == "" {
		importType = "html"
	}

	var result importer.Result
	var err error
	switch importType {
	case "datastore":
		content, readErr := readUploadedFile(r, "file")
		if readErr != nil {
			err = readErr
			break
		}
		result, err = h.app.Importer.ImportShaarliDatastore(r.Context(), content)
	case "api":
		baseURL := strings.TrimSpace(r.FormValue("shaarli_url"))
		secret := strings.TrimSpace(r.FormValue("api_secret"))
		if baseURL == "" || secret == "" {
			err = errors.New("shaarli_url and api_secret are required")
			break
		}
		result, err = h.app.Importer.ImportShaarliAPI(r.Context(), baseURL, secret)
	case "gongyu":
		content, readErr := readUploadedFile(r, "file")
		if readErr != nil {
			err = readErr
			break
		}
		result, err = h.app.Importer.ImportGongyuJSON(r.Context(), content)
	default:
		content, readErr := readUploadedFile(r, "file")
		if readErr != nil {
			err = readErr
			break
		}
		result, err = h.app.Importer.ImportNetscape(r.Context(), content)
	}

	if err != nil {
		setFlashError(w, "Import failed: "+err.Error())
		http.Redirect(w, r, "/admin/settings", http.StatusFound)
		return
	}
	if len(result.Errors) > 0 {
		setFlashError(w, fmt.Sprintf("Imported %d, skipped %d. Errors: %s", result.Imported, result.Skipped, strings.Join(result.Errors, "; ")))
	} else {
		setFlashSuccess(w, fmt.Sprintf("Imported %d bookmarks, skipped %d.", result.Imported, result.Skipped))
	}
	http.Redirect(w, r, "/admin/settings", http.StatusFound)
}

func (h *Handler) ImportPage(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/admin/settings", http.StatusFound)
}

func (h *Handler) ExportBookmarks(w http.ResponseWriter, r *http.Request) {
	format := strings.TrimSpace(r.URL.Query().Get("format"))
	if format == "" {
		format = "html"
	}
	bookmarks, err := h.app.Repos.Bookmarks.Latest(r.Context(), 1_000_000)
	if err != nil {
		http.Error(w, "could not export bookmarks", http.StatusInternalServerError)
		return
	}

	if format == "json" {
		content, err := h.app.Exporter.GenerateJSON(bookmarks)
		if err != nil {
			http.Error(w, "could not build JSON export", http.StatusInternalServerError)
			return
		}
		filename := "bookmarks_" + time.Now().UTC().Format("20060102_150405") + ".json"
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
		_, _ = w.Write([]byte(content))
		return
	}

	content := h.app.Exporter.GenerateNetscape(bookmarks)
	filename := "bookmarks_" + time.Now().UTC().Format("20060102_150405") + ".html"
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	_, _ = w.Write([]byte(content))
}

func (h *Handler) appInfo() view.AppInfo {
	return view.AppInfo{Name: h.app.Config.AppName, URL: h.app.Config.AppURL}
}

func (h *Handler) hasSocialProviders(ctx context.Context) bool {
	twitterAPIKey, _ := h.app.Settings.Get(ctx, "twitter_api_key", "")
	twitterAPISecret, _ := h.app.Settings.Get(ctx, "twitter_api_secret", "")
	twitterAccessToken, _ := h.app.Settings.Get(ctx, "twitter_access_token", "")
	twitterAccessSecret, _ := h.app.Settings.Get(ctx, "twitter_access_secret", "")
	hasTwitter := twitterAPIKey != "" && twitterAPISecret != "" && twitterAccessToken != "" && twitterAccessSecret != ""

	mastodonInstance, _ := h.app.Settings.Get(ctx, "mastodon_instance", "")
	mastodonToken, _ := h.app.Settings.Get(ctx, "mastodon_access_token", "")
	hasMastodon := mastodonInstance != "" && mastodonToken != ""

	blueskyHandle, _ := h.app.Settings.Get(ctx, "bluesky_handle", "")
	blueskyPass, _ := h.app.Settings.Get(ctx, "bluesky_app_password", "")
	hasBluesky := blueskyHandle != "" && blueskyPass != ""

	return hasTwitter || hasMastodon || hasBluesky
}

func (h *Handler) readBookmarkFromRequest(r *http.Request, exceptID int64) (model.Bookmark, error) {
	urlValue := strings.TrimSpace(r.FormValue("url"))
	title := strings.TrimSpace(r.FormValue("title"))
	description := strings.TrimSpace(r.FormValue("description"))

	if err := validateURL(urlValue); err != nil {
		return model.Bookmark{}, err
	}
	if title == "" {
		return model.Bookmark{}, errors.New("title is required")
	}
	if len(title) > 500 {
		return model.Bookmark{}, errors.New("title is too long")
	}
	exists, err := h.app.Repos.Bookmarks.URLExists(r.Context(), urlValue, exceptID)
	if err != nil {
		return model.Bookmark{}, err
	}
	if exists {
		return model.Bookmark{}, errors.New("a bookmark with this URL already exists")
	}

	return model.Bookmark{
		URL:         urlValue,
		Title:       title,
		Description: description,
	}, nil
}

func readUploadedFile(r *http.Request, key string) (string, error) {
	file, _, err := r.FormFile(key)
	if err != nil {
		return "", err
	}
	defer file.Close()
	content, err := io.ReadAll(io.LimitReader(file, 10*1024*1024))
	if err != nil {
		return "", err
	}
	return string(content), nil
}

func validateURL(value string) error {
	if strings.TrimSpace(value) == "" {
		return errors.New("url is required")
	}
	if len(value) > 2048 {
		return errors.New("url is too long")
	}
	parsed, err := url.ParseRequestURI(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return errors.New("invalid URL")
	}
	return nil
}

var emailRegex = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func looksLikeEmail(value string) bool {
	if _, err := mail.ParseAddress(value); err == nil {
		return true
	}
	return emailRegex.MatchString(value)
}

func readIntQuery(r *http.Request, key string, fallback int) int {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
}

package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

func TestAdminDashboard(t *testing.T) {
	var sinceValues []time.Time
	store := &mockStore{
		countBookmarks: func(ctx context.Context) (int64, error) {
			return 42, nil
		},
		countBookmarksSince: func(ctx context.Context, since time.Time) (int64, error) {
			sinceValues = append(sinceValues, since)
			return 5, nil
		},
		recentBookmarks: func(ctx context.Context, limit int64) ([]model.Bookmark, error) {
			return nil, nil
		},
		bookmarksOverTime: func(ctx context.Context, since time.Time) ([]model.BookmarksOverTimeRow, error) {
			return nil, nil
		},
		topDomains: func(ctx context.Context, since time.Time, limit int) ([]model.TopDomainsRow, error) {
			return nil, nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("GET", srv.URL+"/admin/dashboard", nil)
	if err != nil { t.Fatal(err) }
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}

	// sinceValues[0] = thisMonth, sinceValues[1] = thisWeek
	if len(sinceValues) >= 2 {
		weekStart := sinceValues[1]
		if weekStart.Weekday() != time.Monday {
			t.Errorf("thisWeek since should be Monday, got %s", weekStart.Weekday())
		}
	}
}

func TestWeekStartIsMonday(t *testing.T) {
	// The formula used in AdminDashboard: (int(weekday)+6)%7 days back from today
	for _, day := range []time.Weekday{time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday, time.Saturday, time.Sunday} {
		// Find next date with this weekday
		d := time.Date(2026, 3, 2, 12, 0, 0, 0, time.UTC) // Monday
		for d.Weekday() != day {
			d = d.AddDate(0, 0, 1)
		}
		got := d.AddDate(0, 0, -((int(d.Weekday()) + 6) % 7))
		if got.Weekday() != time.Monday {
			t.Errorf("for %s: week start = %s, want Monday", day, got.Weekday())
		}
		if got.After(d) {
			t.Errorf("for %s: week start %s is after the day itself %s", day, got, d)
		}
	}
}

func TestAdminDashboardRedirectsGuest(t *testing.T) {
	store := &mockStore{
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := noRedirectClient().Get(srv.URL + "/admin/dashboard")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if loc != "/login" {
		t.Errorf("Location = %q, want /login", loc)
	}
}

func TestAdminBookmarks(t *testing.T) {
	store := &mockStore{
		searchBookmarks: func(ctx context.Context, query string, page, perPage int) (*model.PaginatedBookmarks, error) {
			return &model.PaginatedBookmarks{
				Bookmarks:   []model.Bookmark{{ID: 1, Title: "Test", Url: "https://example.com", ShortUrl: "abc", CreatedAt: time.Now(), UpdatedAt: time.Now()}},
				CurrentPage: 1, LastPage: 1, Total: 1,
			}, nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("GET", srv.URL+"/admin/bookmarks", nil)
	if err != nil { t.Fatal(err) }
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestAdminCreateBookmarkPage(t *testing.T) {
	store := &mockStore{
		getSetting: func(ctx context.Context, key string) (model.Setting, error) {
			return model.Setting{}, sql.ErrNoRows
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("GET", srv.URL+"/admin/bookmarks/create", nil)
	if err != nil { t.Fatal(err) }
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestAdminCreateBookmarkValidation(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(url.Values{"url": {""}, "title": {""}}, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/bookmarks", strings.NewReader(form.Encode()))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(cookie)
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200 (re-rendered form with errors)", resp.StatusCode)
	}
}

func TestAdminCreateBookmarkDuplicate(t *testing.T) {
	store := &mockStore{
		getBookmarkByURL: func(ctx context.Context, u string) (model.Bookmark, error) {
			return model.Bookmark{ID: 1, Title: "Existing", Url: u, ShortUrl: "abc"}, nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(url.Values{"url": {"https://example.com"}, "title": {"Test"}}, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/bookmarks", strings.NewReader(form.Encode()))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestAdminCreateBookmarkSuccess(t *testing.T) {
	var createdURL string
	store := &mockStore{
		getBookmarkByURL: func(ctx context.Context, u string) (model.Bookmark, error) {
			return model.Bookmark{}, sql.ErrNoRows
		},
		shortURLExists: func(ctx context.Context, shortUrl string) (bool, error) {
			return false, nil
		},
		createBookmark: func(ctx context.Context, arg model.CreateBookmarkParams) (model.Bookmark, error) {
			createdURL = arg.Url
			return model.Bookmark{ID: 1, Title: arg.Title, Url: arg.Url, ShortUrl: arg.ShortUrl}, nil
		},
		updateBookmark: func(ctx context.Context, arg model.UpdateBookmarkParams) error {
			return nil
		},
		getSetting: func(ctx context.Context, key string) (model.Setting, error) {
			return model.Setting{}, sql.ErrNoRows
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(url.Values{"url": {"https://example.com"}, "title": {"My Bookmark"}}, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/bookmarks", strings.NewReader(form.Encode()))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(cookie)
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	if createdURL != "https://example.com" {
		t.Errorf("created URL = %q, want https://example.com", createdURL)
	}
}

func TestAdminEditBookmarkPage(t *testing.T) {
	store := &mockStore{
		getBookmarkByID: func(ctx context.Context, id int64) (model.Bookmark, error) {
			if id == 1 {
				return model.Bookmark{ID: 1, Title: "Test", Url: "https://example.com", ShortUrl: "abc", CreatedAt: time.Now(), UpdatedAt: time.Now()}, nil
			}
			return model.Bookmark{}, sql.ErrNoRows
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("GET", srv.URL+"/admin/bookmarks/1/edit", nil)
	if err != nil { t.Fatal(err) }
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestAdminUpdateBookmark(t *testing.T) {
	var updatedTitle string
	store := &mockStore{
		getBookmarkByID: func(ctx context.Context, id int64) (model.Bookmark, error) {
			return model.Bookmark{ID: 1, Title: "Old", Url: "https://example.com", ShortUrl: "abc"}, nil
		},
		updateBookmark: func(ctx context.Context, arg model.UpdateBookmarkParams) error {
			updatedTitle = arg.Title
			return nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(url.Values{"url": {"https://example.com"}, "title": {"Updated Title"}, "description": {"desc"}}, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/bookmarks/1", strings.NewReader(form.Encode()))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(cookie)
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	if updatedTitle != "Updated Title" {
		t.Errorf("updated title = %q, want Updated Title", updatedTitle)
	}
}

func TestAdminDeleteBookmark(t *testing.T) {
	var deletedID int64
	store := &mockStore{
		deleteBookmark: func(ctx context.Context, id int64) error {
			deletedID = id
			return nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(nil, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/bookmarks/42/delete", strings.NewReader(form.Encode()))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(cookie)
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	if deletedID != 42 {
		t.Errorf("deleted ID = %d, want 42", deletedID)
	}
}

func TestAdminDeleteAllBookmarks(t *testing.T) {
	store := &mockStore{
		deleteAllBookmarks: func(ctx context.Context) (int64, error) {
			return 10, nil
		},
	}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(url.Values{"confirmation": {"DELETE ALL BOOKMARKS"}}, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/bookmarks/delete-all", strings.NewReader(form.Encode()))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(cookie)
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
}

func TestAdminDeleteAllBookmarksBadConfirmation(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := withCsrf(url.Values{"confirmation": {"wrong text"}}, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/admin/bookmarks/delete-all", strings.NewReader(form.Encode()))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(cookie)
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "tab=danger") {
		t.Errorf("Location = %q, should contain tab=danger", loc)
	}
}

func TestFetchMetadataAPI(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	ogServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		if _, err := w.Write([]byte(`<html><head>
			<meta property="og:title" content="OG Title">
			<meta property="og:description" content="OG Desc">
			<meta property="og:image" content="https://example.com/img.png">
		</head></html>`)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
	defer ogServer.Close()

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	body := `{"url":"` + ogServer.URL + `"}`
	req, err := http.NewRequest("POST", srv.URL+"/admin/bookmarks/fetch-metadata", strings.NewReader(body))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}

	var meta struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		OGImage     string `json:"og_image"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&meta); err != nil {
		t.Fatal(err)
	}
	if meta.Title != "OG Title" {
		t.Errorf("title = %q, want OG Title", meta.Title)
	}
	if meta.Description != "OG Desc" {
		t.Errorf("description = %q, want OG Desc", meta.Description)
	}
	if meta.OGImage != "https://example.com/img.png" {
		t.Errorf("og_image = %q, want https://example.com/img.png", meta.OGImage)
	}
}

func TestFetchMetadataAPIMissingURL(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Admin"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("POST", srv.URL+"/admin/bookmarks/fetch-metadata", strings.NewReader(`{}`))
	if err != nil { t.Fatal(err) }
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 400 {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

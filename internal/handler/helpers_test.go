package handler

import (
	"context"
	"database/sql"
	"net/http"
	"net/url"
	"testing"
	"time"

	gongyu "github.com/angristan/gongyu"
	"github.com/angristan/gongyu/internal/background"
	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/thumbnail"
)

// mockStore implements model.Store with function fields.
// Unset methods panic, which is intentional — tests should only set the
// methods they expect to be called.
type mockStore struct {
	allBookmarks             func(ctx context.Context) ([]model.Bookmark, error)
	getBookmarkByID          func(ctx context.Context, id int64) (model.Bookmark, error)
	getBookmarkByShortURL    func(ctx context.Context, shortUrl string) (model.Bookmark, error)
	getBookmarkByURL         func(ctx context.Context, url string) (model.Bookmark, error)
	getBookmarkByShaarliHash func(ctx context.Context, hash string) (model.Bookmark, error)
	listBookmarks            func(ctx context.Context, limit, offset int64) ([]model.Bookmark, error)
	recentBookmarks          func(ctx context.Context, limit int64) ([]model.Bookmark, error)
	countBookmarks           func(ctx context.Context) (int64, error)
	countBookmarksSince      func(ctx context.Context, since time.Time) (int64, error)
	shortURLExists           func(ctx context.Context, shortUrl string) (bool, error)
	createBookmark           func(ctx context.Context, arg model.CreateBookmarkParams) (model.Bookmark, error)
	updateBookmark           func(ctx context.Context, arg model.UpdateBookmarkParams) error
	deleteBookmark           func(ctx context.Context, id int64) error
	deleteAllBookmarks       func(ctx context.Context) (int64, error)
	bulkImportBookmarks      func(ctx context.Context, bookmarks []model.Bookmark) (int, int, error)
	bookmarksOverTime        func(ctx context.Context, since time.Time) ([]model.BookmarksOverTimeRow, error)
	topDomains               func(ctx context.Context, since time.Time, limit int) ([]model.TopDomainsRow, error)
	searchBookmarks          func(ctx context.Context, query string, page, perPage int) (*model.PaginatedBookmarks, error)
	createUser               func(ctx context.Context, arg model.CreateUserParams) (model.User, error)
	getUserByEmail           func(ctx context.Context, email string) (model.User, error)
	getUserByID              func(ctx context.Context, id int64) (model.User, error)
	countUsers               func(ctx context.Context) (int64, error)
	getSetting               func(ctx context.Context, key string) (model.Setting, error)
	upsertSetting            func(ctx context.Context, key, value string, encrypted int64) error
	createSession            func(ctx context.Context, arg model.CreateSessionParams) error
	getSession               func(ctx context.Context, token string) (model.Session, error)
	deleteSession            func(ctx context.Context, token string) error
	deleteExpiredSessions    func(ctx context.Context) (int64, error)
	ping                     func(ctx context.Context) error
}

func (m *mockStore) AllBookmarks(ctx context.Context) ([]model.Bookmark, error) {
	return m.allBookmarks(ctx)
}
func (m *mockStore) GetBookmarkByID(ctx context.Context, id int64) (model.Bookmark, error) {
	return m.getBookmarkByID(ctx, id)
}
func (m *mockStore) GetBookmarkByShortURL(ctx context.Context, shortUrl string) (model.Bookmark, error) {
	return m.getBookmarkByShortURL(ctx, shortUrl)
}
func (m *mockStore) GetBookmarkByURL(ctx context.Context, u string) (model.Bookmark, error) {
	return m.getBookmarkByURL(ctx, u)
}
func (m *mockStore) GetBookmarkByShaarliHash(ctx context.Context, hash string) (model.Bookmark, error) {
	return m.getBookmarkByShaarliHash(ctx, hash)
}
func (m *mockStore) ListBookmarks(ctx context.Context, limit, offset int64) ([]model.Bookmark, error) {
	return m.listBookmarks(ctx, limit, offset)
}
func (m *mockStore) RecentBookmarks(ctx context.Context, limit int64) ([]model.Bookmark, error) {
	return m.recentBookmarks(ctx, limit)
}
func (m *mockStore) CountBookmarks(ctx context.Context) (int64, error) {
	return m.countBookmarks(ctx)
}
func (m *mockStore) CountBookmarksSince(ctx context.Context, since time.Time) (int64, error) {
	return m.countBookmarksSince(ctx, since)
}
func (m *mockStore) ShortURLExists(ctx context.Context, shortUrl string) (bool, error) {
	return m.shortURLExists(ctx, shortUrl)
}
func (m *mockStore) CreateBookmark(ctx context.Context, arg model.CreateBookmarkParams) (model.Bookmark, error) {
	return m.createBookmark(ctx, arg)
}
func (m *mockStore) UpdateBookmark(ctx context.Context, arg model.UpdateBookmarkParams) error {
	return m.updateBookmark(ctx, arg)
}
func (m *mockStore) DeleteBookmark(ctx context.Context, id int64) error {
	return m.deleteBookmark(ctx, id)
}
func (m *mockStore) DeleteAllBookmarks(ctx context.Context) (int64, error) {
	return m.deleteAllBookmarks(ctx)
}
func (m *mockStore) BulkImportBookmarks(ctx context.Context, bookmarks []model.Bookmark) (int, int, error) {
	return m.bulkImportBookmarks(ctx, bookmarks)
}
func (m *mockStore) BookmarksOverTime(ctx context.Context, since time.Time) ([]model.BookmarksOverTimeRow, error) {
	return m.bookmarksOverTime(ctx, since)
}
func (m *mockStore) TopDomains(ctx context.Context, since time.Time, limit int) ([]model.TopDomainsRow, error) {
	return m.topDomains(ctx, since, limit)
}
func (m *mockStore) SearchBookmarks(ctx context.Context, query string, page, perPage int) (*model.PaginatedBookmarks, error) {
	return m.searchBookmarks(ctx, query, page, perPage)
}
func (m *mockStore) CreateUser(ctx context.Context, arg model.CreateUserParams) (model.User, error) {
	return m.createUser(ctx, arg)
}
func (m *mockStore) GetUserByEmail(ctx context.Context, email string) (model.User, error) {
	return m.getUserByEmail(ctx, email)
}
func (m *mockStore) GetUserByID(ctx context.Context, id int64) (model.User, error) {
	return m.getUserByID(ctx, id)
}
func (m *mockStore) CountUsers(ctx context.Context) (int64, error) {
	return m.countUsers(ctx)
}
func (m *mockStore) GetSetting(ctx context.Context, key string) (model.Setting, error) {
	return m.getSetting(ctx, key)
}
func (m *mockStore) UpsertSetting(ctx context.Context, key, value string, encrypted int64) error {
	return m.upsertSetting(ctx, key, value, encrypted)
}
func (m *mockStore) CreateSession(ctx context.Context, arg model.CreateSessionParams) error {
	return m.createSession(ctx, arg)
}
func (m *mockStore) GetSession(ctx context.Context, token string) (model.Session, error) {
	return m.getSession(ctx, token)
}
func (m *mockStore) DeleteSession(ctx context.Context, token string) error {
	return m.deleteSession(ctx, token)
}
func (m *mockStore) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	return m.deleteExpiredSessions(ctx)
}
func (m *mockStore) Ping(ctx context.Context) error { return m.ping(ctx) }
func (m *mockStore) Close() error                   { return nil }

var testEncKey = []byte("0123456789abcdef") // 16 bytes for AES-128

func closeTestBody(t *testing.T, resp *http.Response) {
	t.Helper()
	if err := resp.Body.Close(); err != nil {
		t.Errorf("failed to close response body: %v", err)
	}
}

func newTestHandler(store model.Store) http.Handler {
	return newTestHandlerWithDeps(store, stubMetadataFetcher{}, stubSocialClient{})
}

func newTestHandlerWithDeps(store model.Store, fetcher metadataFetcher, socialClient socialSharer) http.Handler {
	h, err := New(store, testEncKey, "http://localhost", gongyu.StaticFS, background.New(1), &http.Client{})
	if err != nil {
		panic(err)
	}
	if fetcher != nil {
		h.ThumbnailFetcher = fetcher
	}
	if socialClient != nil {
		h.SocialClient = socialClient
	}
	return h.Routes()
}

type stubMetadataFetcher struct {
	fetch func(ctx context.Context, rawURL string) (*thumbnail.Metadata, error)
}

func (s stubMetadataFetcher) FetchMetadata(ctx context.Context, rawURL string) (*thumbnail.Metadata, error) {
	if s.fetch != nil {
		return s.fetch(ctx, rawURL)
	}
	return &thumbnail.Metadata{}, nil
}

type stubSocialClient struct {
	share func(ctx context.Context, bg *background.Runner, store model.Store, encKey []byte, b *model.Bookmark)
}

func (s stubSocialClient) ShareBookmark(ctx context.Context, bg *background.Runner, store model.Store, encKey []byte, b *model.Bookmark) {
	if s.share != nil {
		s.share(ctx, bg, store, encKey, b)
	}
}

// loginSession creates a session cookie for the given user in the mock store.
func loginSession(store *mockStore, user *model.User) *http.Cookie {
	token := "test-session-token"
	store.getSession = func(ctx context.Context, t string) (model.Session, error) {
		if t == token {
			return model.Session{Token: token, UserID: user.ID, ExpiresAt: time.Now().Add(time.Hour)}, nil
		}
		return model.Session{}, sql.ErrNoRows
	}
	store.getUserByID = func(ctx context.Context, id int64) (model.User, error) {
		if id == user.ID {
			return *user, nil
		}
		return model.User{}, sql.ErrNoRows
	}
	return &http.Cookie{Name: "gongyu_session", Value: token}
}

// noSessionStore returns a getSession func that always returns ErrNoRows.
func noSessionStore() func(ctx context.Context, token string) (model.Session, error) {
	return func(ctx context.Context, token string) (model.Session, error) {
		return model.Session{}, sql.ErrNoRows
	}
}

// withCsrf adds the CSRF token to a form for the given session cookie.
func withCsrf(form url.Values, cookie *http.Cookie) url.Values {
	if form == nil {
		form = url.Values{}
	}
	form.Set("_csrf", csrfToken(cookie.Value, testEncKey))
	return form
}

func withGuestCsrf(form url.Values, cookie *http.Cookie) url.Values {
	if form == nil {
		form = url.Values{}
	}
	form.Set("_csrf", cookie.Value)
	return form
}

// noRedirectClient returns an HTTP client that does not follow redirects.
func noRedirectClient() *http.Client {
	return &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
}

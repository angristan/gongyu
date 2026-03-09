package model

import (
	"context"
	"time"
)

// PaginatedBookmarks holds a page of bookmark results.
type PaginatedBookmarks struct {
	Bookmarks   []Bookmark
	CurrentPage int
	LastPage    int
	PerPage     int
	Total       int
}

// BookmarksOverTimeRow represents a date-count pair for charts.
type BookmarksOverTimeRow struct {
	Date  string
	Count int
}

// TopDomainsRow represents a domain-count pair for charts.
type TopDomainsRow struct {
	Domain string
	Count  int
}

// CreateBookmarkParams contains fields for creating a bookmark.
// Field order matches sqlc output for direct struct conversion.
type CreateBookmarkParams struct {
	ShortUrl        string
	Url             string
	Title           string
	Description     string
	ThumbnailUrl    string
	ShaarliShortUrl string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// UpdateBookmarkParams contains fields for updating a bookmark.
// Field order matches sqlc output (SET columns first, then WHERE column).
type UpdateBookmarkParams struct {
	Url             string
	Title           string
	Description     string
	ThumbnailUrl    string
	ShaarliShortUrl string
	UpdatedAt       time.Time
	ID              int64
}

// CreateUserParams contains fields for creating a user.
type CreateUserParams struct {
	Name      string
	Email     string
	Password  string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// CreateSessionParams contains fields for creating a session.
type CreateSessionParams struct {
	Token     string
	UserID    int64
	ExpiresAt time.Time
}

// Store defines all database operations.
type Store interface {
	// Bookmarks
	AllBookmarks(ctx context.Context) ([]Bookmark, error)
	GetBookmarkByID(ctx context.Context, id int64) (Bookmark, error)
	GetBookmarkByShortURL(ctx context.Context, shortUrl string) (Bookmark, error)
	GetBookmarkByURL(ctx context.Context, url string) (Bookmark, error)
	GetBookmarkByShaarliHash(ctx context.Context, hash string) (Bookmark, error)
	ListBookmarks(ctx context.Context, limit, offset int64) ([]Bookmark, error)
	RecentBookmarks(ctx context.Context, limit int64) ([]Bookmark, error)
	CountBookmarks(ctx context.Context) (int64, error)
	CountBookmarksSince(ctx context.Context, since time.Time) (int64, error)
	ShortURLExists(ctx context.Context, shortUrl string) (bool, error)
	CreateBookmark(ctx context.Context, arg CreateBookmarkParams) (Bookmark, error)
	UpdateBookmark(ctx context.Context, arg UpdateBookmarkParams) error
	DeleteBookmark(ctx context.Context, id int64) error
	DeleteAllBookmarks(ctx context.Context) (int64, error)
	BulkImportBookmarks(ctx context.Context, bookmarks []Bookmark) (imported, skipped int, err error)
	BookmarksOverTime(ctx context.Context, since time.Time) ([]BookmarksOverTimeRow, error)
	TopDomains(ctx context.Context, since time.Time, limit int) ([]TopDomainsRow, error)
	SearchBookmarks(ctx context.Context, query string, page, perPage int) (*PaginatedBookmarks, error)

	// Users
	CreateUser(ctx context.Context, arg CreateUserParams) (User, error)
	GetUserByEmail(ctx context.Context, email string) (User, error)
	GetUserByID(ctx context.Context, id int64) (User, error)
	CountUsers(ctx context.Context) (int64, error)

	// Bookmarks (thumbnail)
	UpdateBookmarkThumbnail(ctx context.Context, id int64, thumbnailURL string) error

	// Settings
	GetSetting(ctx context.Context, key string) (Setting, error)
	GetSettings(ctx context.Context, keys []string) (map[string]Setting, error)
	UpsertSetting(ctx context.Context, key, value string, encrypted bool) error

	// Sessions
	CreateSession(ctx context.Context, arg CreateSessionParams) error
	GetSession(ctx context.Context, token string) (Session, error)
	DeleteSession(ctx context.Context, token string) error
	DeleteExpiredSessions(ctx context.Context) (int64, error)

	// Lifecycle
	Ping(ctx context.Context) error
	Close() error
}

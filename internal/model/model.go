package model

import "time"

type User struct {
	ID           int64
	Name         string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Bookmark struct {
	ID              int64
	ShortURL        string
	URL             string
	Title           string
	Description     string
	ThumbnailURL    string
	ShaarliShortURL string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Setting struct {
	Key       string
	Value     string
	Encrypted bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type BookmarkStats struct {
	TotalBookmarks     int64
	BookmarksThisMonth int64
	BookmarksThisWeek  int64
	RecentBookmarks    []Bookmark
	BookmarksOverTime  []TimeBucket
	BookmarksByDomain  []DomainCount
}

type TimeBucket struct {
	Date  string
	Count int64
}

type DomainCount struct {
	Domain string
	Count  int64
}

type BookmarkPage struct {
	Items      []Bookmark
	Page       int
	PerPage    int
	Total      int64
	TotalPages int
	Search     string
}

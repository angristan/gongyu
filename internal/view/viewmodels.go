package view

import "gongyu/internal/model"

type Flash struct {
	Success string
	Error   string
}

type AppInfo struct {
	Name string
	URL  string
}

type PublicIndexData struct {
	App       AppInfo
	User      *model.User
	Flash     Flash
	Bookmarks model.BookmarkPage
}

type PublicBookmarkData struct {
	App      AppInfo
	User     *model.User
	Flash    Flash
	Bookmark model.Bookmark
}

type LoginData struct {
	App       AppInfo
	Flash     Flash
	Email     string
	ErrorText string
	CSRFToken string
}

type SetupData struct {
	App       AppInfo
	Flash     Flash
	ErrorText string
	CSRFToken string
}

type AdminBookmarksData struct {
	App       AppInfo
	User      *model.User
	Flash     Flash
	Bookmarks model.BookmarkPage
	CSRFToken string
}

type BookmarkFormData struct {
	App            AppInfo
	User           *model.User
	Flash          Flash
	Bookmark       *model.Bookmark
	PrefillURL     string
	PrefillTitle   string
	PrefillDesc    string
	CSRFToken      string
	Action         string
	SubmitLabel    string
	HasSocialShare bool
}

type DashboardData struct {
	App       AppInfo
	User      *model.User
	Flash     Flash
	Stats     model.BookmarkStats
	Period    string
	CSRFToken string
}

type SettingsData struct {
	App           AppInfo
	User          *model.User
	Flash         Flash
	CSRFToken     string
	Settings      map[string]string
	BookmarkCount int64
	ImportResult  map[string]any
	DeleteResult  map[string]any
}

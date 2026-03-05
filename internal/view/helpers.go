package view

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

// LayoutData holds common data rendered by the layout wrapper.
type LayoutData struct {
	User          *model.User
	BaseURL       string
	Flash         string
	StaticVersion string
}

type HomeData struct {
	LayoutData
	Bookmarks []model.Bookmark
	Page      int
	LastPage  int
	Total     int
	Query     string
}

type BookmarkPageData struct {
	LayoutData
	Bookmark model.Bookmark
}

type LoginData struct {
	LayoutData
	Error string
	Email string
}

type SetupData struct {
	LayoutData
	Errors []string
	Name   string
	Email  string
}

type DashboardData struct {
	LayoutData
	Total      int64
	ThisMonth  int64
	ThisWeek   int64
	Recent     []model.Bookmark
	OverTime   []model.BookmarksOverTimeRow
	TopDomains []model.TopDomainsRow
	Period     string
}

type AdminBookmarksData struct {
	LayoutData
	Bookmarks []model.Bookmark
	Page      int
	LastPage  int
	Total     int
	Query     string
}

type BookmarkFormData struct {
	LayoutData
	IsCreate  bool
	HasSocial bool
	Errors    []string
	Existing  *model.Bookmark
	Bookmark  *model.Bookmark
	Form      map[string]string
}

type SettingsData struct {
	LayoutData
	Settings       map[string]string
	Tab            string
	TotalBookmarks int64
}

type ImportData struct {
	LayoutData
	Errors []string
}

type BookmarkletData struct {
	LayoutData
	PrefillURL   string
	PrefillTitle string
	PrefillDesc  string
	Source       string
	Existing     *model.Bookmark
	HasSocial    bool
}

type BookmarkletSavedData struct {
	Bookmark model.Bookmark
}

func Domain(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	host := u.Hostname()
	host = strings.TrimPrefix(host, "www.")
	return host
}

func Timeago(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		m := int(d.Minutes())
		if m == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", m)
	case d < 24*time.Hour:
		h := int(d.Hours())
		if h == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", h)
	case d < 30*24*time.Hour:
		days := int(d.Hours() / 24)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	default:
		return t.Format("Jan 2, 2006")
	}
}

func FormatDate(t time.Time) string {
	return t.Format("Jan 2, 2006")
}

func Truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}

func searchSummary(total int, query string) string {
	word := "results"
	if total == 1 {
		word = "result"
	}
	return fmt.Sprintf(`%d %s for "%s"`, total, word, query)
}

func QueryEscape(s string) string {
	return url.QueryEscape(s)
}

func maxOverTime(rows []model.BookmarksOverTimeRow) int {
	max := 0
	for _, r := range rows {
		if r.Count > max {
			max = r.Count
		}
	}
	return max
}

func barHeight(count, max int) int {
	if max == 0 {
		return 0
	}
	return count * 200 / max
}

func maxDomainCount(rows []model.TopDomainsRow) int {
	max := 0
	for _, r := range rows {
		if r.Count > max {
			max = r.Count
		}
	}
	return max
}

func periodClass(period, current string) string {
	if period == current {
		return "active"
	}
	return ""
}

func tabClass(tab, current string, isDefault bool) string {
	if tab == current || (isDefault && current == "") {
		return "tab active"
	}
	return "tab"
}

func formTitle(isCreate bool) string {
	if isCreate {
		return "Add Bookmark"
	}
	return "Edit Bookmark"
}

func formVal(form map[string]string, key string) string {
	if form == nil {
		return ""
	}
	return form[key]
}

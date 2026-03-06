package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/angristan/gongyu/internal/view"
)

// mondayMidnight returns midnight (00:00 UTC) of the Monday of the week containing t.
func mondayMidnight(t time.Time) time.Time {
	weekday := int(t.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	return time.Date(t.Year(), t.Month(), t.Day()-(weekday-1), 0, 0, 0, 0, time.UTC)
}

func (h *Handler) AdminDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := time.Now().UTC()

	total, err := h.Store.CountBookmarks(ctx)
	if err != nil {
		slog.Error("dashboard: count bookmarks", "error", err)
	}
	thisMonth, err := h.Store.CountBookmarksSince(ctx, time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		slog.Error("dashboard: count bookmarks this month", "error", err)
	}
	thisWeek, err := h.Store.CountBookmarksSince(ctx, mondayMidnight(now))
	if err != nil {
		slog.Error("dashboard: count bookmarks this week", "error", err)
	}
	recent, err := h.Store.RecentBookmarks(ctx, 10)
	if err != nil {
		slog.Error("dashboard: recent bookmarks", "error", err)
	}

	period := r.URL.Query().Get("period")
	var since time.Time
	switch period {
	case "7d":
		since = now.AddDate(0, 0, -7)
	case "90d":
		since = now.AddDate(0, -3, 0)
	case "1y":
		since = now.AddDate(-1, 0, 0)
	case "all":
		since = time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	default:
		period = "30d"
		since = now.AddDate(0, 0, -30)
	}

	overTime, err := h.Store.BookmarksOverTime(ctx, since)
	if err != nil {
		slog.Error("dashboard: bookmarks over time", "error", err)
	}
	topDomains, err := h.Store.TopDomains(ctx, since, 10)
	if err != nil {
		slog.Error("dashboard: top domains", "error", err)
	}

	h.render(w, r, view.AdminDashboardPage(view.DashboardData{
		LayoutData: h.layoutData(w, r),
		Total:      total,
		ThisMonth:  thisMonth,
		ThisWeek:   thisWeek,
		Recent:     recent,
		OverTime:   overTime,
		TopDomains: topDomains,
		Period:     period,
		Since:      since,
	}))
}

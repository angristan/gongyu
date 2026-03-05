package handler

import (
	"net/http"
	"time"

	"github.com/angristan/gongyu/internal/view"
)

func (h *Handler) AdminDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := time.Now().UTC()

	total, _ := h.Store.CountBookmarks(ctx)
	thisMonth, _ := h.Store.CountBookmarksSince(ctx, time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC))
	thisWeek, _ := h.Store.CountBookmarksSince(ctx, now.AddDate(0, 0, -int(now.Weekday())))
	recent, _ := h.Store.RecentBookmarks(ctx, 10)

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

	overTime, _ := h.Store.BookmarksOverTime(ctx, since)
	topDomains, _ := h.Store.TopDomains(ctx, since, 10)

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

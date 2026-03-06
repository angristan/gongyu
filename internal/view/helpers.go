package view

import (
	"fmt"
	"math"
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
	CsrfToken     string
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
	Since      time.Time
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
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
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

// SVG bar chart types

type svgBarChart struct {
	Bars    []svgBar
	YTicks  []svgTick
	XLabels []svgLabel
	PlotX   float64
	PlotY   float64
	PlotW   float64
	PlotH   float64
}

type svgBar struct {
	X, Y, W, H float64
	Label       string
	Count       int
}

type svgTick struct {
	Y     float64
	Label string
}

type svgLabel struct {
	X    float64
	Text string
}

// fillAndRollup fills in zero-count gaps from since to today and rolls up based on period.
// Daily for 7d/30d, weekly for 90d, monthly for 1y/all.
func fillAndRollup(rows []model.BookmarksOverTimeRow, period string, since time.Time) []model.BookmarksOverTimeRow {
	// Build lookup map
	byDate := make(map[string]int, len(rows))
	for _, r := range rows {
		byDate[r.Date] = r.Count
	}

	start := since.UTC().Truncate(24 * time.Hour)
	end := time.Now().UTC().Truncate(24 * time.Hour)

	// For "all", start from the first actual data point
	if period == "all" && len(rows) > 0 {
		if t, err := time.Parse("2006-01-02", rows[0].Date); err == nil {
			start = t
		}
	}

	// Fill all days from since to today
	var filled []model.BookmarksOverTimeRow
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		filled = append(filled, model.BookmarksOverTimeRow{Date: ds, Count: byDate[ds]})
	}

	// Rollup based on period
	switch period {
	case "90d":
		return rollupWeekly(filled)
	case "1y", "all":
		return rollupMonthly(filled)
	default:
		return filled
	}
}

func rollupWeekly(rows []model.BookmarksOverTimeRow) []model.BookmarksOverTimeRow {
	if len(rows) == 0 {
		return rows
	}
	// Sum daily counts by ISO week start (Monday)
	byWeek := make(map[string]int)
	var weeks []string
	for _, r := range rows {
		t, _ := time.Parse("2006-01-02", r.Date)
		// Shift to Monday of the week
		weekStart := t.AddDate(0, 0, -((int(t.Weekday()) + 6) % 7))
		key := weekStart.Format("2006-01-02")
		if _, ok := byWeek[key]; !ok {
			weeks = append(weeks, key)
		}
		byWeek[key] += r.Count
	}

	// Generate all weeks between first and last
	start, _ := time.Parse("2006-01-02", weeks[0])
	end, _ := time.Parse("2006-01-02", weeks[len(weeks)-1])
	var result []model.BookmarksOverTimeRow
	for w := start; !w.After(end); w = w.AddDate(0, 0, 7) {
		key := w.Format("2006-01-02")
		result = append(result, model.BookmarksOverTimeRow{Date: key, Count: byWeek[key]})
	}
	return result
}

func rollupMonthly(rows []model.BookmarksOverTimeRow) []model.BookmarksOverTimeRow {
	if len(rows) == 0 {
		return rows
	}
	// Sum daily counts by month
	byMonth := make(map[string]int)
	var months []string
	for _, r := range rows {
		month := r.Date[:7] // "2006-01"
		if _, ok := byMonth[month]; !ok {
			months = append(months, month)
		}
		byMonth[month] += r.Count
	}

	// Generate all months between first and last
	start, _ := time.Parse("2006-01", months[0])
	end, _ := time.Parse("2006-01", months[len(months)-1])
	var result []model.BookmarksOverTimeRow
	for m := start; !m.After(end); m = m.AddDate(0, 1, 0) {
		key := m.Format("2006-01")
		result = append(result, model.BookmarksOverTimeRow{Date: m.Format("2006-01-02"), Count: byMonth[key]})
	}
	return result
}

func buildBarChart(rows []model.BookmarksOverTimeRow, period string, since time.Time) svgBarChart {
	const (
		width  = 500.0
		height = 240.0
		padL   = 40.0
		padR   = 10.0
		padT   = 10.0
		padB   = 24.0
	)

	rows = fillAndRollup(rows, period, since)

	plotW := width - padL - padR
	plotH := height - padT - padB

	n := len(rows)
	if n == 0 {
		return svgBarChart{PlotX: padL, PlotY: padT, PlotW: plotW, PlotH: plotH}
	}

	maxVal := 0
	for _, r := range rows {
		if r.Count > maxVal {
			maxVal = r.Count
		}
	}
	if maxVal == 0 {
		maxVal = 1
	}

	// Compute ceil value for Y-axis
	step := niceStep(float64(maxVal), 4)
	yMax := step * math.Ceil(float64(maxVal)/step)

	// Y-axis ticks
	var yTicks []svgTick
	for v := step; v <= yMax; v += step {
		y := padT + plotH - (v/yMax)*plotH
		yTicks = append(yTicks, svgTick{Y: y, Label: fmt.Sprintf("%g", v)})
	}

	// Bars
	slotW := plotW / float64(n)
	barW := slotW * 0.7
	if barW > 40 {
		barW = 40
	}
	bars := make([]svgBar, n)
	for i, row := range rows {
		h := float64(row.Count) / yMax * plotH
		if row.Count > 0 && h < 2 {
			h = 2
		}
		bars[i] = svgBar{
			X:     padL + float64(i)*slotW + (slotW-barW)/2,
			Y:     padT + plotH - h,
			W:     barW,
			H:     h,
			Label: barLabel(row.Date, period),
			Count: row.Count,
		}
	}

	// X-axis labels (show ~6-8)
	targetLabels := 6
	if n < targetLabels {
		targetLabels = n
	}
	labelStep := max(n/targetLabels, 1)
	var xLabels []svgLabel
	for i := 0; i < n; i += labelStep {
		x := padL + float64(i)*slotW + slotW/2
		xLabels = append(xLabels, svgLabel{X: x, Text: barLabel(rows[i].Date, period)})
	}

	return svgBarChart{
		Bars: bars, YTicks: yTicks, XLabels: xLabels,
		PlotX: padL, PlotY: padT, PlotW: plotW, PlotH: plotH,
	}
}

func niceStep(maxVal float64, nTicks int) float64 {
	if maxVal <= 0 {
		return 1
	}
	rough := maxVal / float64(nTicks)
	mag := math.Pow(10, math.Floor(math.Log10(rough)))
	norm := rough / mag
	var nice float64
	switch {
	case norm <= 1.5:
		nice = 1
	case norm <= 3:
		nice = 2
	case norm <= 7:
		nice = 5
	default:
		nice = 10
	}
	return nice * mag
}

// barLabel formats a date for display based on the rollup period.
func barLabel(date, period string) string {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return date
	}
	switch period {
	case "1y", "all":
		return t.Format("Jan 06")
	default:
		return t.Format("Jan 2")
	}
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

// paginationItem represents a single element in the pagination bar.
type paginationItem struct {
	Page    int
	Active  bool
	Ellipsis bool
}

// paginationItems builds a windowed page list: 1 ... [current-1, current, current+1] ... last
func paginationItems(page, lastPage int) []paginationItem {
	if lastPage <= 1 {
		return nil
	}

	const window = 2 // pages around current

	// Collect which page numbers to show
	show := make(map[int]bool)
	show[1] = true
	show[lastPage] = true
	for i := page - window; i <= page+window; i++ {
		if i >= 1 && i <= lastPage {
			show[i] = true
		}
	}

	// Build sorted list with ellipsis gaps
	var items []paginationItem
	prev := 0
	for p := 1; p <= lastPage; p++ {
		if !show[p] {
			continue
		}
		if prev > 0 && p > prev+1 {
			items = append(items, paginationItem{Ellipsis: true})
		}
		items = append(items, paginationItem{Page: p, Active: p == page})
		prev = p
	}
	return items
}

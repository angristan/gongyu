package view

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"gongyu/internal/model"
)

func formatDate(value time.Time) string {
	return value.UTC().Format("Jan 02, 2006")
}

func intToString(value int) string {
	return strconv.Itoa(value)
}

func int64ToString(value int64) string {
	return strconv.FormatInt(value, 10)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func paginationURL(basePath string, search string, page int) string {
	params := url.Values{}
	if search != "" {
		params.Set("q", search)
	}
	if page > 1 {
		params.Set("page", fmt.Sprintf("%d", page))
	}
	if encoded := params.Encode(); encoded != "" {
		return basePath + "?" + encoded
	}
	return basePath
}

func valueFromBookmarkOrPrefill(bookmark *model.Bookmark, field string, fallback string) string {
	if bookmark == nil {
		return fallback
	}
	switch field {
	case "url":
		return bookmark.URL
	case "title":
		return bookmark.Title
	case "description":
		return bookmark.Description
	default:
		return fallback
	}
}

func domainFromURL(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return rawURL
	}
	host := parsed.Hostname()
	if len(host) > 4 && host[:4] == "www." {
		host = host[4:]
	}
	return host
}

func faviconURL(rawURL string) string {
	domain := domainFromURL(rawURL)
	if domain == "" {
		return ""
	}
	return "https://www.google.com/s2/favicons?domain=" + url.QueryEscape(domain) + "&sz=64"
}

func maxTimeBucketCount(items []model.TimeBucket) int64 {
	var maxValue int64 = 1
	for _, item := range items {
		if item.Count > maxValue {
			maxValue = item.Count
		}
	}
	return maxValue
}

func maxDomainCount(items []model.DomainCount) int64 {
	var maxValue int64 = 1
	for _, item := range items {
		if item.Count > maxValue {
			maxValue = item.Count
		}
	}
	return maxValue
}

func barHeightStyle(value int64, maxValue int64) string {
	return percentageStyle(value, maxValue, "height")
}

func barWidthStyle(value int64, maxValue int64) string {
	return percentageStyle(value, maxValue, "width")
}

func percentageStyle(value int64, maxValue int64, property string) string {
	if maxValue <= 0 {
		maxValue = 1
	}
	percent := int((float64(value) / float64(maxValue)) * 100)
	if value > 0 && percent < 4 {
		percent = 4
	}
	if percent > 100 {
		percent = 100
	}
	return property + ":" + strconv.Itoa(percent) + "%"
}

func firstBucketLabel(items []model.TimeBucket) string {
	if len(items) == 0 {
		return ""
	}
	return strings.TrimSpace(items[0].Date)
}

func lastBucketLabel(items []model.TimeBucket) string {
	if len(items) == 0 {
		return ""
	}
	return strings.TrimSpace(items[len(items)-1].Date)
}

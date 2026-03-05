package importer

import (
	"html"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

var (
	reBookmark    = regexp.MustCompile(`(?i)<A\s+([^>]+)>([^<]*)</A>(?:\s*<DD>([^<\n]*))?`)
	reAttrHref    = regexp.MustCompile(`(?i)HREF=["']([^"']+)["']`)
	reAttrAddDate = regexp.MustCompile(`(?i)ADD_DATE=["'](\d+)["']`)
	reShaarliHash = regexp.MustCompile(`[?&]([a-zA-Z0-9]{6})$`)
)

// ParseNetscapeBookmarks parses a Netscape HTML bookmark file.
func ParseNetscapeBookmarks(content string) []model.Bookmark {
	matches := reBookmark.FindAllStringSubmatch(content, -1)
	var bookmarks []model.Bookmark

	for _, m := range matches {
		attrs := m[1]
		title := strings.TrimSpace(html.UnescapeString(m[2]))
		description := ""
		if len(m) > 3 {
			description = strings.TrimSpace(html.UnescapeString(m[3]))
		}

		hrefMatch := reAttrHref.FindStringSubmatch(attrs)
		if len(hrefMatch) < 2 {
			continue
		}
		href := html.UnescapeString(hrefMatch[1])
		if href == "" || title == "" {
			continue
		}

		var createdAt time.Time
		if addDateMatch := reAttrAddDate.FindStringSubmatch(attrs); len(addDateMatch) > 1 {
			if ts, err := strconv.ParseInt(addDateMatch[1], 10, 64); err == nil {
				createdAt = time.Unix(ts, 0).UTC()
			}
		}

		// Detect Shaarli hash from URL query string
		var shaarliHash string
		if hashMatch := reShaarliHash.FindStringSubmatch(href); len(hashMatch) > 1 {
			shaarliHash = hashMatch[1]
		}

		bookmarks = append(bookmarks, model.Bookmark{
			Url:             href,
			Title:           title,
			Description:     description,
			ShaarliShortUrl: shaarliHash,
			CreatedAt:       createdAt,
		})
	}

	return bookmarks
}

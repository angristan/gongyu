package importer

import (
	"html"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type ParsedNetscapeBookmark struct {
	URL         string
	Title       string
	Description string
	Timestamp   time.Time
	ShaarliHash string
}

func ParseNetscape(content string) []ParsedNetscapeBookmark {
	normalized := strings.ReplaceAll(strings.ReplaceAll(content, "\r\n", "\n"), "\r", "\n")
	re := regexp.MustCompile(`(?is)<A\s+([^>]+)>([^<]*)</A>(?:\s*<DD>([^<\n]*))?`)
	attributeRegex := regexp.MustCompile(`(?i)(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))`)
	matches := re.FindAllStringSubmatch(normalized, -1)

	bookmarks := make([]ParsedNetscapeBookmark, 0, len(matches))
	for _, match := range matches {
		attrs := map[string]string{}
		for _, attr := range attributeRegex.FindAllStringSubmatch(match[1], -1) {
			value := firstNonEmpty(attr[2], attr[3], attr[4])
			attrs[strings.ToLower(attr[1])] = html.UnescapeString(value)
		}

		urlValue := attrs["href"]
		if !strings.HasPrefix(urlValue, "http") {
			continue
		}

		title := strings.TrimSpace(html.UnescapeString(match[2]))
		if title == "" {
			title = urlValue
		}
		description := ""
		if len(match) > 3 {
			description = strings.TrimSpace(html.UnescapeString(match[3]))
		}

		shaareHash := ""
		if parsedQuery := extractQuery(urlValue); len(parsedQuery) == 6 && isAlphaNum(parsedQuery) {
			shaareHash = parsedQuery
		}

		timestamp := time.Now().UTC()
		if rawTimestamp := attrs["add_date"]; rawTimestamp != "" {
			if unix, err := strconv.ParseInt(rawTimestamp, 10, 64); err == nil {
				timestamp = time.Unix(unix, 0).UTC()
			}
		}

		bookmarks = append(bookmarks, ParsedNetscapeBookmark{
			URL:         urlValue,
			Title:       title,
			Description: description,
			Timestamp:   timestamp,
			ShaarliHash: shaareHash,
		})
	}

	return bookmarks
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func extractQuery(rawURL string) string {
	index := strings.Index(rawURL, "?")
	if index == -1 || index+1 >= len(rawURL) {
		return ""
	}
	return rawURL[index+1:]
}

func isAlphaNum(value string) bool {
	for _, char := range value {
		if !(char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9' || char == '_' || char == '-') {
			return false
		}
	}
	return true
}

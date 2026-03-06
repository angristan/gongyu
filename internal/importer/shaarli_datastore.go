package importer

import (
	"bytes"
	"compress/flate"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

// ParseShaarliDatastore parses a Shaarli datastore.php file.
// The format is: <?php /* base64(gzdeflate(serialize(data))) */ ?>
func ParseShaarliDatastore(content string) ([]model.Bookmark, error) {
	// Strip PHP wrapper
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "<?php /* ")
	content = strings.TrimSuffix(content, " */ ?>")
	content = strings.TrimSpace(content)

	// Base64 decode
	decoded, err := base64.StdEncoding.DecodeString(content)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}

	// Raw DEFLATE inflate (PHP's gzdeflate produces RFC 1951)
	r := flate.NewReader(bytes.NewReader(decoded))
	defer func() {
		if cerr := r.Close(); cerr != nil {
			slog.Error("failed to close flate reader", "error", cerr)
		}
	}()

	data, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("read decompressed: %w", err)
	}

	return parseSerializedPHP(string(data))
}

// parseSerializedPHP is a simplified parser for PHP serialized arrays of link objects.
// It extracts URL, title, description, created timestamp, and shorturl using regex.
var (
	reURL         = regexp.MustCompile(`s:\d+:"url";s:\d+:"([^"]+)"`)
	reTitlePHP    = regexp.MustCompile(`s:\d+:"title";s:\d+:"([^"]*)"`)
	reDescription = regexp.MustCompile(`s:\d+:"description";s:\d+:"([^"]*)"`)
	reShortURL    = regexp.MustCompile(`s:\d+:"shorturl";s:\d+:"([^"]*)"`)
	reCreated     = regexp.MustCompile(`s:\d+:"created";O:\d+:"DateTime":\d+:\{[^}]*s:\d+:"date";s:\d+:"([^"]+)"`)
	reCreatedTS   = regexp.MustCompile(`s:\d+:"created";i:(\d+)`)
)

func parseSerializedPHP(data string) ([]model.Bookmark, error) {
	urls := reURL.FindAllStringSubmatch(data, -1)
	titles := reTitlePHP.FindAllStringSubmatch(data, -1)
	descriptions := reDescription.FindAllStringSubmatch(data, -1)
	shortURLs := reShortURL.FindAllStringSubmatch(data, -1)
	createdDates := reCreated.FindAllStringSubmatch(data, -1)
	createdTimestamps := reCreatedTS.FindAllStringSubmatch(data, -1)

	n := len(urls)
	var bookmarks []model.Bookmark

	for i := range n {
		b := model.Bookmark{
			Url: urls[i][1],
		}
		if i < len(titles) {
			b.Title = titles[i][1]
		}
		if i < len(descriptions) {
			b.Description = descriptions[i][1]
		}
		if i < len(shortURLs) {
			b.ShaarliShortUrl = shortURLs[i][1]
		}

		// Try DateTime object first, then integer timestamp
		if i < len(createdDates) {
			if t, err := time.Parse("2006-01-02 15:04:05.000000", createdDates[i][1]); err == nil {
				b.CreatedAt = t.UTC()
			}
		}
		if b.CreatedAt.IsZero() && i < len(createdTimestamps) {
			if ts, err := strconv.ParseInt(createdTimestamps[i][1], 10, 64); err == nil {
				b.CreatedAt = time.Unix(ts, 0).UTC()
			}
		}

		if b.Url != "" {
			bookmarks = append(bookmarks, b)
		}
	}

	return bookmarks, nil
}

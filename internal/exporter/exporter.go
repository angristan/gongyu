package exporter

import (
	"encoding/json"
	"fmt"
	"html"
	"strings"
	"time"

	"gongyu/internal/model"
)

type Service struct{}

func New() *Service {
	return &Service{}
}

func (s *Service) GenerateNetscape(bookmarks []model.Bookmark) string {
	builder := &strings.Builder{}
	builder.WriteString("<!DOCTYPE NETSCAPE-Bookmark-file-1>\n")
	builder.WriteString("<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">\n")
	builder.WriteString("<TITLE>Bookmarks</TITLE>\n")
	builder.WriteString("<H1>Bookmarks</H1>\n")
	builder.WriteString("<DL><p>\n")

	for _, bookmark := range bookmarks {
		builder.WriteString("    <DT><A HREF=\"")
		builder.WriteString(html.EscapeString(bookmark.URL))
		builder.WriteString("\" ADD_DATE=\"")
		builder.WriteString(fmt.Sprintf("%d", bookmark.CreatedAt.Unix()))
		builder.WriteString("\">")
		builder.WriteString(html.EscapeString(bookmark.Title))
		builder.WriteString("</A>\n")
		if strings.TrimSpace(bookmark.Description) != "" {
			builder.WriteString("    <DD>")
			builder.WriteString(html.EscapeString(bookmark.Description))
			builder.WriteString("\n")
		}
	}

	builder.WriteString("</DL><p>\n")
	return builder.String()
}

func (s *Service) GenerateJSON(bookmarks []model.Bookmark) (string, error) {
	payload := struct {
		ExportedAt string `json:"exported_at"`
		Version    string `json:"version"`
		Count      int    `json:"count"`
		Bookmarks  []any  `json:"bookmarks"`
	}{
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Version:    "1.0",
		Count:      len(bookmarks),
		Bookmarks:  make([]any, 0, len(bookmarks)),
	}
	for _, bookmark := range bookmarks {
		payload.Bookmarks = append(payload.Bookmarks, map[string]any{
			"id":                bookmark.ID,
			"url":               bookmark.URL,
			"title":             bookmark.Title,
			"description":       nullIfEmpty(bookmark.Description),
			"short_url":         bookmark.ShortURL,
			"shaarli_short_url": nullIfEmpty(bookmark.ShaarliShortURL),
			"thumbnail_url":     nullIfEmpty(bookmark.ThumbnailURL),
			"created_at":        bookmark.CreatedAt.Format(time.RFC3339),
			"updated_at":        bookmark.UpdatedAt.Format(time.RFC3339),
		})
	}

	bytes, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

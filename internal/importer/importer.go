package importer

import (
	"compress/flate"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"gongyu/internal/model"
	"gongyu/internal/repo"
)

type Service struct {
	bookmarks *repo.BookmarkRepository
	client    *http.Client
}

type Result struct {
	Imported int      `json:"imported"`
	Skipped  int      `json:"skipped"`
	Errors   []string `json:"errors"`
}

func New(bookmarks *repo.BookmarkRepository) *Service {
	return &Service{bookmarks: bookmarks, client: &http.Client{Timeout: 60 * time.Second}}
}

func (s *Service) ImportNetscape(ctx context.Context, content string) (Result, error) {
	parsed := ParseNetscape(content)
	items := make([]model.Bookmark, 0, len(parsed))
	for _, item := range parsed {
		items = append(items, model.Bookmark{
			URL:             item.URL,
			Title:           item.Title,
			Description:     item.Description,
			ShaarliShortURL: item.ShaarliHash,
			CreatedAt:       item.Timestamp,
			UpdatedAt:       item.Timestamp,
		})
	}
	imported, skipped, errorsList, err := s.bookmarks.BulkImport(ctx, items)
	if err != nil {
		return Result{}, err
	}
	return Result{Imported: imported, Skipped: skipped, Errors: errorsList}, nil
}

func (s *Service) ImportGongyuJSON(ctx context.Context, content string) (Result, error) {
	var payload struct {
		Bookmarks []struct {
			URL             string `json:"url"`
			Title           string `json:"title"`
			Description     string `json:"description"`
			ShortURL        string `json:"short_url"`
			ShaarliShortURL string `json:"shaarli_short_url"`
			ThumbnailURL    string `json:"thumbnail_url"`
			CreatedAt       string `json:"created_at"`
			UpdatedAt       string `json:"updated_at"`
		} `json:"bookmarks"`
	}
	if err := json.Unmarshal([]byte(content), &payload); err != nil {
		return Result{}, err
	}
	items := make([]model.Bookmark, 0, len(payload.Bookmarks))
	for _, item := range payload.Bookmarks {
		createdAt := parseTimestamp(item.CreatedAt)
		updatedAt := parseTimestamp(item.UpdatedAt)
		if updatedAt.IsZero() {
			updatedAt = createdAt
		}
		items = append(items, model.Bookmark{
			URL:             item.URL,
			Title:           item.Title,
			Description:     item.Description,
			ShortURL:        item.ShortURL,
			ShaarliShortURL: item.ShaarliShortURL,
			ThumbnailURL:    item.ThumbnailURL,
			CreatedAt:       createdAt,
			UpdatedAt:       updatedAt,
		})
	}
	imported, skipped, errorsList, err := s.bookmarks.BulkImport(ctx, items)
	if err != nil {
		return Result{}, err
	}
	return Result{Imported: imported, Skipped: skipped, Errors: errorsList}, nil
}

func (s *Service) ImportShaarliAPI(ctx context.Context, baseURL, apiSecret string) (Result, error) {
	bookmarks, err := s.fetchShaarliBookmarks(ctx, baseURL, apiSecret)
	if err != nil {
		return Result{}, err
	}
	imported, skipped, errorsList, err := s.bookmarks.BulkImport(ctx, bookmarks)
	if err != nil {
		return Result{}, err
	}
	return Result{Imported: imported, Skipped: skipped, Errors: errorsList}, nil
}

func (s *Service) ImportShaarliDatastore(ctx context.Context, content string) (Result, error) {
	bookmarks, err := ParseShaarliDatastore(content)
	if err != nil {
		return Result{Errors: []string{err.Error()}}, nil
	}
	imported, skipped, errorsList, err := s.bookmarks.BulkImport(ctx, bookmarks)
	if err != nil {
		return Result{}, err
	}
	return Result{Imported: imported, Skipped: skipped, Errors: errorsList}, nil
}

func ParseShaarliDatastore(content string) ([]model.Bookmark, error) {
	prefix := "<?php /* "
	suffix := " */ ?>"
	content = strings.TrimSpace(content)
	if !strings.HasPrefix(content, prefix) {
		return nil, errors.New("invalid datastore format: missing PHP prefix")
	}
	content = strings.TrimPrefix(content, prefix)
	if strings.HasSuffix(content, suffix) {
		content = strings.TrimSuffix(content, suffix)
	} else if strings.HasSuffix(content, " */") {
		content = strings.TrimSuffix(content, " */")
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(content))
	if err != nil {
		return nil, fmt.Errorf("invalid datastore format: base64 decode failed")
	}
	reader := flate.NewReader(strings.NewReader(string(decoded)))
	decompressed, err := io.ReadAll(reader)
	reader.Close()
	if err != nil {
		return nil, fmt.Errorf("invalid datastore format: inflate failed")
	}

	serialized := string(decompressed)
	return extractBookmarksFromSerialized(serialized), nil
}

func extractBookmarksFromSerialized(serialized string) []model.Bookmark {
	urls := regexp.MustCompile(`s:\d+:"(?:\\0\*\\0)?url";s:\d+:"([^"]+)"`)
	titles := regexp.MustCompile(`s:\d+:"(?:\\0\*\\0)?title";s:\d+:"([^"]*)"`)
	descriptions := regexp.MustCompile(`s:\d+:"(?:\\0\*\\0)?description";s:\d+:"([^"]*)"`)
	shorts := regexp.MustCompile(`s:\d+:"(?:\\0\*\\0)?shortUrl";s:\d+:"([^"]*)"`)

	urlMatches := urls.FindAllStringSubmatch(serialized, -1)
	titleMatches := titles.FindAllStringSubmatch(serialized, -1)
	descriptionMatches := descriptions.FindAllStringSubmatch(serialized, -1)
	shortMatches := shorts.FindAllStringSubmatch(serialized, -1)

	count := len(urlMatches)
	bookmarks := make([]model.Bookmark, 0, count)
	for i := 0; i < count; i++ {
		urlValue := htmlUnescape(urlMatches[i][1])
		if !strings.HasPrefix(urlValue, "http") {
			continue
		}
		title := urlValue
		if i < len(titleMatches) {
			title = htmlUnescape(titleMatches[i][1])
		}
		description := ""
		if i < len(descriptionMatches) {
			description = htmlUnescape(descriptionMatches[i][1])
		}
		short := ""
		if i < len(shortMatches) {
			short = htmlUnescape(shortMatches[i][1])
		}
		bookmarks = append(bookmarks, model.Bookmark{
			URL:             urlValue,
			Title:           title,
			Description:     description,
			ShaarliShortURL: short,
			CreatedAt:       time.Now().UTC(),
			UpdatedAt:       time.Now().UTC(),
		})
	}
	return bookmarks
}

func (s *Service) fetchShaarliBookmarks(ctx context.Context, baseURL, apiSecret string) ([]model.Bookmark, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	jwt := buildShaarliJWT(apiSecret)

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/links?limit=all", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+jwt)
	request.Header.Set("Accept", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusUnauthorized {
		return nil, errors.New("authentication failed. Please check your API secret")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		payload, _ := io.ReadAll(response.Body)
		return nil, fmt.Errorf("api request failed with status %d: %s", response.StatusCode, string(payload))
	}

	var rows []struct {
		URL         string `json:"url"`
		Title       string `json:"title"`
		Description string `json:"description"`
		ShortURL    string `json:"shorturl"`
		Created     string `json:"created"`
		Updated     string `json:"updated"`
	}
	if err := json.NewDecoder(response.Body).Decode(&rows); err != nil {
		return nil, err
	}

	bookmarks := make([]model.Bookmark, 0, len(rows))
	for _, row := range rows {
		if row.URL == "" {
			continue
		}
		createdAt := parseTimestamp(row.Created)
		updatedAt := parseTimestamp(row.Updated)
		if updatedAt.IsZero() {
			updatedAt = createdAt
		}
		bookmarks = append(bookmarks, model.Bookmark{
			URL:             row.URL,
			Title:           defaultString(row.Title, row.URL),
			Description:     row.Description,
			ShaarliShortURL: row.ShortURL,
			CreatedAt:       createdAt,
			UpdatedAt:       updatedAt,
		})
	}

	return bookmarks, nil
}

func parseTimestamp(value string) time.Time {
	if strings.TrimSpace(value) == "" {
		return time.Now().UTC()
	}
	if unix, err := time.Parse(time.RFC3339, value); err == nil {
		return unix.UTC()
	}
	formats := []string{time.RFC3339Nano, "2006-01-02 15:04:05", time.RFC1123Z}
	for _, format := range formats {
		if parsed, err := time.Parse(format, value); err == nil {
			return parsed.UTC()
		}
	}
	return time.Now().UTC()
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

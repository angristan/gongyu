package service

import (
	"context"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type Metadata struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	OGImage     string `json:"og_image"`
}

type MetadataService struct {
	client *http.Client
}

func NewMetadataService() *MetadataService {
	return &MetadataService{client: &http.Client{Timeout: 10 * time.Second}}
}

func (s *MetadataService) Fetch(ctx context.Context, url string) Metadata {
	metadata := Metadata{}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return metadata
	}
	request.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Gongyu/1.0)")

	response, err := s.client.Do(request)
	if err != nil {
		return metadata
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return metadata
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return metadata
	}
	htmlContent := string(body)

	if title := firstMatch(htmlContent, `(?is)<title[^>]*>([^<]+)</title>`); title != "" {
		metadata.Title = CleanTitle(html.UnescapeString(strings.TrimSpace(title)))
	}
	if description := firstMatch(htmlContent, `(?is)<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>`); description != "" {
		metadata.Description = html.UnescapeString(strings.TrimSpace(description))
	}
	if description := firstMatch(htmlContent, `(?is)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>`); description != "" {
		metadata.Description = html.UnescapeString(strings.TrimSpace(description))
	}
	if ogTitle := firstMatch(htmlContent, `(?is)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>`); ogTitle != "" {
		metadata.Title = CleanTitle(html.UnescapeString(strings.TrimSpace(ogTitle)))
	}
	if ogTitle := firstMatch(htmlContent, `(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>`); ogTitle != "" {
		metadata.Title = CleanTitle(html.UnescapeString(strings.TrimSpace(ogTitle)))
	}
	if ogDesc := firstMatch(htmlContent, `(?is)<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>`); ogDesc != "" {
		metadata.Description = html.UnescapeString(strings.TrimSpace(ogDesc))
	}
	if ogDesc := firstMatch(htmlContent, `(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["'][^>]*>`); ogDesc != "" {
		metadata.Description = html.UnescapeString(strings.TrimSpace(ogDesc))
	}
	if ogImage := firstMatch(htmlContent, `(?is)<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>`); ogImage != "" {
		metadata.OGImage = strings.TrimSpace(ogImage)
	}
	if ogImage := firstMatch(htmlContent, `(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>`); ogImage != "" {
		metadata.OGImage = strings.TrimSpace(ogImage)
	}

	return metadata
}

func firstMatch(source, pattern string) string {
	re := regexp.MustCompile(pattern)
	match := re.FindStringSubmatch(source)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

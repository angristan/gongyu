package thumbnail

import (
	"context"
	"fmt"
	"html"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var (
	reTitle       = regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)
	reMetaDesc    = regexp.MustCompile(`(?i)<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']`)
	reMetaDescAlt = regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']`)
	reOGTitle     = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']`)
	reOGTitleAlt  = regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']`)
	reOGDesc      = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']`)
	reOGDescAlt   = regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']`)
	reOGImage     = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']`)
	reOGImageAlt  = regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']`)
)

type Metadata struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	OGImage     string `json:"og_image"`
}

// FetchMetadata fetches title, description, and og:image from a URL.
func FetchMetadata(ctx context.Context, rawURL string) (*Metadata, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Gongyu/1.0)")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", rawURL, err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			slog.Error("failed to close response body", "error", err)
		}
	}()

	// Read at most 1MB
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	htmlStr := string(body)

	meta := &Metadata{}

	// Title: prefer og:title, fall back to <title>
	if m := firstMatch(reOGTitle, reOGTitleAlt, htmlStr); m != "" {
		meta.Title = html.UnescapeString(strings.TrimSpace(m))
	} else if m := reTitle.FindStringSubmatch(htmlStr); len(m) > 1 {
		meta.Title = html.UnescapeString(strings.TrimSpace(m[1]))
	}

	// Description: prefer og:description, fall back to meta description
	if m := firstMatch(reOGDesc, reOGDescAlt, htmlStr); m != "" {
		meta.Description = html.UnescapeString(strings.TrimSpace(m))
	} else if m := firstMatch(reMetaDesc, reMetaDescAlt, htmlStr); m != "" {
		meta.Description = html.UnescapeString(strings.TrimSpace(m))
	}

	// og:image
	if m := firstMatch(reOGImage, reOGImageAlt, htmlStr); m != "" {
		imgURL := html.UnescapeString(strings.TrimSpace(m))
		// Resolve relative URLs
		if !strings.HasPrefix(imgURL, "http") {
			base, err := url.Parse(rawURL)
			if err == nil {
				ref, err := url.Parse(imgURL)
				if err == nil {
					imgURL = base.ResolveReference(ref).String()
				}
			}
		}
		meta.OGImage = imgURL
	}

	return meta, nil
}

func firstMatch(re1, re2 *regexp.Regexp, s string) string {
	if m := re1.FindStringSubmatch(s); len(m) > 1 {
		return m[1]
	}
	if m := re2.FindStringSubmatch(s); len(m) > 1 {
		return m[1]
	}
	return ""
}

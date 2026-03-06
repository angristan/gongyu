package social

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// PostToMastodon posts a status to a Mastodon instance.
func PostToMastodon(instance, accessToken, title, bookmarkURL string) error {
	// Normalize instance URL
	instance = strings.TrimSpace(instance)
	instance = strings.TrimRight(instance, "/")
	if !strings.HasPrefix(instance, "http") {
		instance = "https://" + instance
	}

	// Status: max 500 chars
	maxTitleLen := 500 - len([]rune(bookmarkURL)) - 2
	title = truncateRunes(title, maxTitleLen)
	status := title + "\n" + bookmarkURL

	form := url.Values{"status": {status}}
	req, err := http.NewRequest("POST", instance+"/api/v1/statuses", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			slog.Error("failed to close response body", "error", err)
		}
	}()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mastodon API error %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

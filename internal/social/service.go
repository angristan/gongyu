package social

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"gongyu/internal/model"
	"gongyu/internal/service"
)

type Service struct {
	settings *service.SettingsService
	logger   *slog.Logger
	client   *http.Client
}

func New(settings *service.SettingsService, logger *slog.Logger) *Service {
	return &Service{
		settings: settings,
		logger:   logger,
		client:   &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *Service) ShareBookmark(ctx context.Context, bookmark model.Bookmark) {
	s.PostToTwitter(ctx, bookmark)
	s.PostToMastodon(ctx, bookmark)
	s.PostToBluesky(ctx, bookmark)
}

func (s *Service) PostToTwitter(ctx context.Context, bookmark model.Bookmark) bool {
	apiKey, _ := s.settings.Get(ctx, "twitter_api_key", "")
	apiSecret, _ := s.settings.Get(ctx, "twitter_api_secret", "")
	accessToken, _ := s.settings.Get(ctx, "twitter_access_token", "")
	accessSecret, _ := s.settings.Get(ctx, "twitter_access_secret", "")
	if apiKey == "" || apiSecret == "" || accessToken == "" || accessSecret == "" {
		return false
	}

	text := formatTwitterText(bookmark)
	urlValue := "https://api.twitter.com/2/tweets"
	oauth := map[string]string{
		"oauth_consumer_key":     apiKey,
		"oauth_nonce":            service.RandomToken(16),
		"oauth_signature_method": "HMAC-SHA1",
		"oauth_timestamp":        fmt.Sprintf("%d", time.Now().Unix()),
		"oauth_token":            accessToken,
		"oauth_version":          "1.0",
	}
	base := buildBaseString("POST", urlValue, oauth)
	signingKey := percentEncode(apiSecret) + "&" + percentEncode(accessSecret)
	mac := hmac.New(sha1.New, []byte(signingKey))
	_, _ = mac.Write([]byte(base))
	oauth["oauth_signature"] = base64.StdEncoding.EncodeToString(mac.Sum(nil))

	headerParts := make([]string, 0, len(oauth))
	for key, value := range oauth {
		headerParts = append(headerParts, fmt.Sprintf("%s=\"%s\"", percentEncode(key), percentEncode(value)))
	}
	authHeader := "OAuth " + strings.Join(headerParts, ", ")

	body, _ := json.Marshal(map[string]string{"text": text})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, urlValue, bytes.NewReader(body))
	if err != nil {
		return false
	}
	request.Header.Set("Authorization", authHeader)
	request.Header.Set("Content-Type", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		s.logger.Warn("twitter request failed", "error", err)
		return false
	}
	defer response.Body.Close()
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return true
	}
	payload, _ := io.ReadAll(response.Body)
	s.logger.Warn("twitter post failed", "status", response.StatusCode, "body", string(payload))
	return false
}

func (s *Service) PostToMastodon(ctx context.Context, bookmark model.Bookmark) bool {
	instance, _ := s.settings.Get(ctx, "mastodon_instance", "")
	accessToken, _ := s.settings.Get(ctx, "mastodon_access_token", "")
	if instance == "" || accessToken == "" {
		return false
	}
	instance = strings.TrimRight(instance, "/")
	if !strings.HasPrefix(instance, "http") {
		instance = "https://" + instance
	}
	status := formatMastodonStatus(bookmark)
	payload, _ := json.Marshal(map[string]string{"status": status})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, instance+"/api/v1/statuses", bytes.NewReader(payload))
	if err != nil {
		return false
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Content-Type", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode >= 200 && response.StatusCode < 300
}

func (s *Service) PostToBluesky(ctx context.Context, bookmark model.Bookmark) bool {
	handle, _ := s.settings.Get(ctx, "bluesky_handle", "")
	password, _ := s.settings.Get(ctx, "bluesky_app_password", "")
	if handle == "" || password == "" {
		return false
	}
	sessionPayload, _ := json.Marshal(map[string]string{
		"identifier": handle,
		"password":   password,
	})
	sessionReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://bsky.social/xrpc/com.atproto.server.createSession", bytes.NewReader(sessionPayload))
	if err != nil {
		return false
	}
	sessionReq.Header.Set("Content-Type", "application/json")
	sessionRes, err := s.client.Do(sessionReq)
	if err != nil {
		return false
	}
	defer sessionRes.Body.Close()
	if sessionRes.StatusCode < 200 || sessionRes.StatusCode >= 300 {
		return false
	}
	var sessionData struct {
		DID       string `json:"did"`
		AccessJWT string `json:"accessJwt"`
	}
	if err := json.NewDecoder(sessionRes.Body).Decode(&sessionData); err != nil {
		return false
	}

	text := formatBlueskyText(bookmark)
	record := map[string]any{
		"$type":     "app.bsky.feed.post",
		"text":      text,
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	}
	payload, _ := json.Marshal(map[string]any{
		"repo":       sessionData.DID,
		"collection": "app.bsky.feed.post",
		"record":     record,
	})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://bsky.social/xrpc/com.atproto.repo.createRecord", bytes.NewReader(payload))
	if err != nil {
		return false
	}
	request.Header.Set("Authorization", "Bearer "+sessionData.AccessJWT)
	request.Header.Set("Content-Type", "application/json")
	response, err := s.client.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode >= 200 && response.StatusCode < 300
}

func formatTwitterText(bookmark model.Bookmark) string {
	maxLength := 280
	urlLength := 23
	available := maxLength - urlLength - 1
	title := trimWithEllipsis(bookmark.Title, available)
	return title + " " + bookmark.URL
}

func formatMastodonStatus(bookmark model.Bookmark) string {
	available := 500 - len(bookmark.URL) - 1
	return trimWithEllipsis(bookmark.Title, available) + " " + bookmark.URL
}

func formatBlueskyText(bookmark model.Bookmark) string {
	available := 300 - len(bookmark.URL) - 1
	return trimWithEllipsis(bookmark.Title, available) + " " + bookmark.URL
}

func trimWithEllipsis(value string, limit int) string {
	if limit < 1 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	if limit == 1 {
		return "…"
	}
	return string(runes[:limit-1]) + "…"
}

func buildBaseString(method, rawURL string, params map[string]string) string {
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sortStrings(keys)
	pairs := make([]string, 0, len(keys))
	for _, key := range keys {
		pairs = append(pairs, percentEncode(key)+"="+percentEncode(params[key]))
	}
	return strings.ToUpper(method) + "&" + percentEncode(rawURL) + "&" + percentEncode(strings.Join(pairs, "&"))
}

func percentEncode(value string) string {
	return strings.ReplaceAll(url.QueryEscape(value), "+", "%20")
}

func sortStrings(items []string) {
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if items[j] < items[i] {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
}

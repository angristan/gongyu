package social

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

// truncateRunes truncates s to maxLen runes, appending "…" if truncated.
func truncateRunes(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) > maxLen {
		return string(runes[:maxLen-1]) + "…"
	}
	return s
}

// PostToTwitter posts a tweet using OAuth 1.0a and the Twitter API v2.
func (c *Client) PostToTwitter(ctx context.Context, apiKey, apiSecret, accessToken, accessSecret, title, bookmarkURL string) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Truncate title to fit in 280 chars (URL = 23 chars fixed by t.co)
	maxTitleLen := 280 - 23 - 2 // 2 for space + newline
	title = truncateRunes(title, maxTitleLen)
	tweetText := title + "\n" + bookmarkURL

	endpoint := "https://api.twitter.com/2/tweets"
	body, err := json.Marshal(map[string]string{"text": tweetText})
	if err != nil {
		return fmt.Errorf("marshal tweet: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	nonce, err := generateNonce()
	if err != nil {
		return fmt.Errorf("generate nonce: %w", err)
	}

	// OAuth 1.0a signature
	oauthParams := map[string]string{
		"oauth_consumer_key":     apiKey,
		"oauth_nonce":            nonce,
		"oauth_signature_method": "HMAC-SHA1",
		"oauth_timestamp":        fmt.Sprintf("%d", time.Now().Unix()),
		"oauth_token":            accessToken,
		"oauth_version":          "1.0",
	}

	sigBase := oauthSignatureBase("POST", endpoint, oauthParams)
	sigKey := url.QueryEscape(apiSecret) + "&" + url.QueryEscape(accessSecret)
	mac := hmac.New(sha1.New, []byte(sigKey))
	mac.Write([]byte(sigBase))
	oauthParams["oauth_signature"] = base64.StdEncoding.EncodeToString(mac.Sum(nil))

	var authParts []string
	for k, v := range oauthParams {
		authParts = append(authParts, fmt.Sprintf(`%s="%s"`, k, url.QueryEscape(v)))
	}
	slices.Sort(authParts)
	req.Header.Set("Authorization", "OAuth "+strings.Join(authParts, ", "))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			slog.Error("failed to close response body", "error", err)
		}
	}()
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("twitter API error %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

func oauthSignatureBase(method, endpoint string, params map[string]string) string {
	keys := slices.Sorted(maps.Keys(params))

	var pairs []string
	for _, k := range keys {
		pairs = append(pairs, url.QueryEscape(k)+"="+url.QueryEscape(params[k]))
	}
	paramStr := strings.Join(pairs, "&")
	return method + "&" + url.QueryEscape(endpoint) + "&" + url.QueryEscape(paramStr)
}

func generateNonce() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", b), nil
}

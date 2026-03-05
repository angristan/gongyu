package social

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"crypto/rand"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

// PostToTwitter posts a tweet using OAuth 1.0a and the Twitter API v2.
func PostToTwitter(apiKey, apiSecret, accessToken, accessSecret, title, bookmarkURL string) error {
	// Truncate title to fit in 280 chars (URL = 23 chars fixed by t.co)
	maxTitleLen := 280 - 23 - 2 // 2 for space + newline
	if len(title) > maxTitleLen {
		title = title[:maxTitleLen-1] + "…"
	}
	tweetText := title + "\n" + bookmarkURL

	endpoint := "https://api.twitter.com/2/tweets"
	body := `{"text":` + jsonString(tweetText) + `}`

	req, err := http.NewRequest("POST", endpoint, strings.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	// OAuth 1.0a signature
	oauthParams := map[string]string{
		"oauth_consumer_key":     apiKey,
		"oauth_nonce":            generateNonce(),
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

	resp, err := http.DefaultClient.Do(req)
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

func generateNonce() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand: " + err.Error())
	}
	return fmt.Sprintf("%x", b)
}

func jsonString(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r", `\r`)
	s = strings.ReplaceAll(s, "\t", `\t`)
	return `"` + s + `"`
}

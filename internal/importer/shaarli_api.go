package importer

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/stanislas/gongyu/internal/model"
)

// FetchFromShaarliAPI fetches bookmarks from a Shaarli instance's REST API.
func FetchFromShaarliAPI(instanceURL, apiSecret string) ([]model.Bookmark, error) {
	instanceURL = strings.TrimRight(instanceURL, "/")
	token, err := generateShaarliJWT(apiSecret)
	if err != nil {
		return nil, fmt.Errorf("generate JWT: %w", err)
	}

	req, err := http.NewRequest("GET", instanceURL+"/api/v1/links?limit=all", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			log.Printf("failed to close response body: %v", err)
		}
	}()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("shaarli API error %d: %s", resp.StatusCode, string(body))
	}

	var links []struct {
		URL         string `json:"url"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Created     string `json:"created"`
		Updated     string `json:"updated"`
		Shorturl    string `json:"shorturl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&links); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	var bookmarks []model.Bookmark
	for _, l := range links {
		b := model.Bookmark{
			Url:             l.URL,
			Title:           l.Title,
			Description:     l.Description,
			ShaarliShortUrl: l.Shorturl,
		}
		if t, err := time.Parse(time.RFC3339, l.Created); err == nil {
			b.CreatedAt = t.UTC()
		}
		if t, err := time.Parse(time.RFC3339, l.Updated); err == nil {
			b.UpdatedAt = t.UTC()
		}
		bookmarks = append(bookmarks, b)
	}

	return bookmarks, nil
}

func generateShaarliJWT(secret string) (string, error) {
	header := base64URLEncode([]byte(`{"typ":"JWT","alg":"HS512"}`))
	payload := base64URLEncode(fmt.Appendf(nil, `{"iat":%d}`, time.Now().Unix()))
	sigInput := header + "." + payload

	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write([]byte(sigInput))
	sig := base64URLEncode(mac.Sum(nil))

	return sigInput + "." + sig, nil
}

func base64URLEncode(data []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(data), "=")
}

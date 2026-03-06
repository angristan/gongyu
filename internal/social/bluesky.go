package social

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

const bskyAPI = "https://bsky.social/xrpc"

type bskySession struct {
	AccessJwt string `json:"accessJwt"`
	DID       string `json:"did"`
}

// PostToBluesky posts to Bluesky via the AT Protocol.
func PostToBluesky(handle, appPassword, title, bookmarkURL, thumbnailURL, description string) error {
	// Create session
	session, err := bskyLogin(handle, appPassword)
	if err != nil {
		return fmt.Errorf("bluesky login: %w", err)
	}

	// Build post text
	text := title + "\n" + bookmarkURL

	// Build facets for the URL link
	urlStart := len(title) + 1 // +1 for newline
	urlEnd := urlStart + len(bookmarkURL)
	facets := []map[string]any{
		{
			"index": map[string]int{
				"byteStart": urlStart,
				"byteEnd":   urlEnd,
			},
			"features": []map[string]string{
				{
					"$type": "app.bsky.richtext.facet#link",
					"uri":   bookmarkURL,
				},
			},
		},
	}

	record := map[string]any{
		"$type":     "app.bsky.feed.post",
		"text":      text,
		"createdAt": time.Now().UTC().Format(time.RFC3339),
		"facets":    facets,
	}

	// Add external embed if we have a thumbnail
	embed := map[string]any{
		"$type": "app.bsky.embed.external",
		"external": map[string]any{
			"uri":         bookmarkURL,
			"title":       title,
			"description": description,
		},
	}

	if thumbnailURL != "" {
		blob, err := bskyUploadBlob(session, thumbnailURL)
		if err == nil && blob != nil {
			embed["external"].(map[string]any)["thumb"] = blob
		}
	}
	record["embed"] = embed

	body := map[string]any{
		"repo":       session.DID,
		"collection": "app.bsky.feed.post",
		"record":     record,
	}

	return bskyRequest(session, "com.atproto.repo.createRecord", body)
}

func bskyLogin(handle, appPassword string) (*bskySession, error) {
	body, err := json.Marshal(map[string]string{
		"identifier": handle,
		"password":   appPassword,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal login: %w", err)
	}
	resp, err := http.Post(bskyAPI+"/com.atproto.server.createSession", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer closeBody(resp)
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("login failed %d: %s", resp.StatusCode, string(b))
	}
	var s bskySession
	return &s, json.NewDecoder(resp.Body).Decode(&s)
}

func bskyUploadBlob(session *bskySession, imageURL string) (any, error) {
	resp, err := http.Get(imageURL)
	if err != nil {
		return nil, err
	}
	defer closeBody(resp)

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}
	// Only allow image types
	if !strings.HasPrefix(contentType, "image/") {
		return nil, fmt.Errorf("not an image: %s", contentType)
	}

	imgData, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB max
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", bskyAPI+"/com.atproto.repo.uploadBlob", bytes.NewReader(imgData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+session.AccessJwt)
	req.Header.Set("Content-Type", contentType)

	uploadResp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer closeBody(uploadResp)
	if uploadResp.StatusCode != 200 {
		return nil, fmt.Errorf("upload failed: %d", uploadResp.StatusCode)
	}

	var result struct {
		Blob any `json:"blob"`
	}
	if err := json.NewDecoder(uploadResp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Blob, nil
}

func bskyRequest(session *bskySession, method string, body any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}
	req, err := http.NewRequest("POST", bskyAPI+"/"+method, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+session.AccessJwt)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer closeBody(resp)
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("bluesky API error %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func closeBody(resp *http.Response) {
	if err := resp.Body.Close(); err != nil {
		slog.Error("failed to close response body", "error", err)
	}
}

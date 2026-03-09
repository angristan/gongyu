package social

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/angristan/gongyu/internal/model"
)

// Keys returns the setting keys used by social providers.
func Keys() []string {
	return []string{
		"twitter_api_key", "twitter_api_secret",
		"twitter_access_token", "twitter_access_secret",
		"mastodon_instance", "mastodon_access_token",
		"bluesky_handle", "bluesky_app_password",
	}
}

// Client posts bookmarks to social providers.
type Client struct {
	httpClient *http.Client
}

func NewClient(httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	return &Client{httpClient: httpClient}
}

// PostAll posts a bookmark to all configured social providers synchronously.
// Intended to be called from a background task.
func (c *Client) PostAll(ctx context.Context, b *model.Bookmark, settings map[string]string) {
	if hasTwitter(settings) {
		if err := c.PostToTwitter(ctx,
			settings["twitter_api_key"], settings["twitter_api_secret"],
			settings["twitter_access_token"], settings["twitter_access_secret"],
			b.Title, b.Url,
		); err != nil {
			slog.Error("twitter post failed", "error", err)
		}
	}

	if hasMastodon(settings) {
		if err := c.PostToMastodon(ctx,
			settings["mastodon_instance"], settings["mastodon_access_token"],
			b.Title, b.Url,
		); err != nil {
			slog.Error("mastodon post failed", "error", err)
		}
	}

	if hasBluesky(settings) {
		if err := c.PostToBluesky(ctx,
			settings["bluesky_handle"], settings["bluesky_app_password"],
			b.Title, b.Url, b.ThumbnailUrl, b.Description,
		); err != nil {
			slog.Error("bluesky post failed", "error", err)
		}
	}
}

// HasProviders reports whether any social provider is configured.
func HasProviders(settings map[string]string) bool {
	return hasTwitter(settings) || hasMastodon(settings) || hasBluesky(settings)
}

func hasTwitter(s map[string]string) bool {
	return s["twitter_api_key"] != "" &&
		s["twitter_api_secret"] != "" &&
		s["twitter_access_token"] != "" &&
		s["twitter_access_secret"] != ""
}

func hasMastodon(s map[string]string) bool {
	return s["mastodon_instance"] != "" &&
		s["mastodon_access_token"] != ""
}

func hasBluesky(s map[string]string) bool {
	return s["bluesky_handle"] != "" &&
		s["bluesky_app_password"] != ""
}

package social

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/angristan/gongyu/internal/background"
	"github.com/angristan/gongyu/internal/model"
)

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

func (c *Client) ShareBookmark(ctx context.Context, bg *background.Runner, store model.Store, encKey []byte, b *model.Bookmark) {
	get := func(key string) string {
		return model.GetSetting(ctx, store, key, encKey)
	}

	if hasTwitterProvider(get) {
		apiKey := get("twitter_api_key")
		apiSecret := get("twitter_api_secret")
		accessToken := get("twitter_access_token")
		accessSecret := get("twitter_access_secret")
		bg.Do(func(taskCtx context.Context) {
			if err := c.PostToTwitter(taskCtx, apiKey, apiSecret, accessToken, accessSecret, b.Title, b.Url); err != nil {
				slog.Error("twitter post failed", "error", err)
			}
		})
	}

	if hasMastodonProvider(get) {
		instance := get("mastodon_instance")
		accessToken := get("mastodon_access_token")
		bg.Do(func(taskCtx context.Context) {
			if err := c.PostToMastodon(taskCtx, instance, accessToken, b.Title, b.Url); err != nil {
				slog.Error("mastodon post failed", "error", err)
			}
		})
	}

	if hasBlueskyProvider(get) {
		handle := get("bluesky_handle")
		appPassword := get("bluesky_app_password")
		bg.Do(func(taskCtx context.Context) {
			if err := c.PostToBluesky(taskCtx, handle, appPassword, b.Title, b.Url, b.ThumbnailUrl, b.Description); err != nil {
				slog.Error("bluesky post failed", "error", err)
			}
		})
	}
}

func HasSocialProviders(ctx context.Context, store model.Store, encKey []byte) bool {
	get := func(key string) string {
		return model.GetSetting(ctx, store, key, encKey)
	}
	return hasTwitterProvider(get) || hasMastodonProvider(get) || hasBlueskyProvider(get)
}

func hasTwitterProvider(get func(string) string) bool {
	return get("twitter_api_key") != "" &&
		get("twitter_api_secret") != "" &&
		get("twitter_access_token") != "" &&
		get("twitter_access_secret") != ""
}

func hasMastodonProvider(get func(string) string) bool {
	return get("mastodon_instance") != "" &&
		get("mastodon_access_token") != ""
}

func hasBlueskyProvider(get func(string) string) bool {
	return get("bluesky_handle") != "" &&
		get("bluesky_app_password") != ""
}

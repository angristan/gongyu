package social

import (
	"context"
	"log/slog"

	"github.com/angristan/gongyu/internal/background"
	"github.com/angristan/gongyu/internal/model"
)

func ShareBookmark(bg *background.Runner, store model.Store, encKey []byte, b *model.Bookmark) {
	ctx := context.Background()
	get := func(key string) string {
		return model.GetSetting(ctx, store, key, encKey)
	}

	if hasTwitterProvider(get) {
		apiKey := get("twitter_api_key")
		bg.Do(func() {
			if err := PostToTwitter(apiKey, get("twitter_api_secret"), get("twitter_access_token"), get("twitter_access_secret"), b.Title, b.Url); err != nil {
				slog.Error("twitter post failed", "error", err)
			}
		})
	}

	if hasMastodonProvider(get) {
		instance := get("mastodon_instance")
		bg.Do(func() {
			if err := PostToMastodon(instance, get("mastodon_access_token"), b.Title, b.Url); err != nil {
				slog.Error("mastodon post failed", "error", err)
			}
		})
	}

	if hasBlueskyProvider(get) {
		handle := get("bluesky_handle")
		bg.Do(func() {
			if err := PostToBluesky(handle, get("bluesky_app_password"), b.Title, b.Url, b.ThumbnailUrl, b.Description); err != nil {
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

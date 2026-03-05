package social

import (
	"context"
	"log"

	"github.com/stanislas/gongyu/internal/model"
)

func ShareBookmark(ctx context.Context, store model.Store, encKey []byte, b *model.Bookmark) {
	get := func(key string) string {
		return model.GetSetting(ctx, store, key, encKey)
	}

	if apiKey := get("twitter_api_key"); apiKey != "" {
		go func() {
			if err := PostToTwitter(apiKey, get("twitter_api_secret"), get("twitter_access_token"), get("twitter_access_secret"), b.Title, b.Url); err != nil {
				log.Printf("twitter post error: %v", err)
			}
		}()
	}

	if instance := get("mastodon_instance"); instance != "" {
		go func() {
			if err := PostToMastodon(instance, get("mastodon_access_token"), b.Title, b.Url); err != nil {
				log.Printf("mastodon post error: %v", err)
			}
		}()
	}

	if handle := get("bluesky_handle"); handle != "" {
		go func() {
			if err := PostToBluesky(handle, get("bluesky_app_password"), b.Title, b.Url, b.ThumbnailUrl, b.Description); err != nil {
				log.Printf("bluesky post error: %v", err)
			}
		}()
	}
}

func HasSocialProviders(ctx context.Context, store model.Store, encKey []byte) bool {
	get := func(key string) string {
		return model.GetSetting(ctx, store, key, encKey)
	}
	return get("twitter_api_key") != "" || get("mastodon_instance") != "" || get("bluesky_handle") != ""
}

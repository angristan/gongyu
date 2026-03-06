package social

import "testing"

func TestProviderReadiness(t *testing.T) {
	tests := []struct {
		name   string
		values map[string]string
		want   bool
	}{
		{
			name: "twitter requires full config",
			values: map[string]string{
				"twitter_api_key": "key",
			},
			want: false,
		},
		{
			name: "twitter is ready with full config",
			values: map[string]string{
				"twitter_api_key":       "key",
				"twitter_api_secret":    "secret",
				"twitter_access_token":  "token",
				"twitter_access_secret": "access-secret",
			},
			want: true,
		},
		{
			name: "mastodon requires token",
			values: map[string]string{
				"mastodon_instance": "mastodon.social",
			},
			want: false,
		},
		{
			name: "mastodon is ready with instance and token",
			values: map[string]string{
				"mastodon_instance":     "mastodon.social",
				"mastodon_access_token": "token",
			},
			want: true,
		},
		{
			name: "bluesky requires app password",
			values: map[string]string{
				"bluesky_handle": "user.bsky.social",
			},
			want: false,
		},
		{
			name: "bluesky is ready with full config",
			values: map[string]string{
				"bluesky_handle":       "user.bsky.social",
				"bluesky_app_password": "app-password",
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			get := func(key string) string {
				return tt.values[key]
			}

			got := hasTwitterProvider(get) || hasMastodonProvider(get) || hasBlueskyProvider(get)
			if got != tt.want {
				t.Errorf("provider readiness = %v, want %v", got, tt.want)
			}
		})
	}
}

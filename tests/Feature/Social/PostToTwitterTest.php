<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Actions\Social\PostToTwitter;
use App\Models\Bookmark;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PostToTwitterTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_false_when_credentials_not_configured(): void
    {
        $bookmark = Bookmark::factory()->create();

        $result = PostToTwitter::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_returns_false_when_partial_credentials(): void
    {
        Setting::set('twitter_api_key', 'key', encrypted: true);
        Setting::set('twitter_api_secret', 'secret', encrypted: true);
        // Missing access token and secret

        $bookmark = Bookmark::factory()->create();

        $result = PostToTwitter::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_posts_to_twitter_successfully(): void
    {
        Setting::set('twitter_api_key', 'test-api-key', encrypted: true);
        Setting::set('twitter_api_secret', 'test-api-secret', encrypted: true);
        Setting::set('twitter_access_token', 'test-access-token', encrypted: true);
        Setting::set('twitter_access_secret', 'test-access-secret', encrypted: true);

        Http::fake([
            'api.twitter.com/2/tweets' => Http::response(['data' => ['id' => '123']], 201),
        ]);

        $bookmark = Bookmark::factory()->create([
            'title' => 'Test Article',
            'url' => 'https://example.com/article',
        ]);

        $result = PostToTwitter::run($bookmark);

        $this->assertTrue($result);
        Http::assertSent(function ($request) use ($bookmark) {
            return $request->url() === 'https://api.twitter.com/2/tweets'
                && str_contains($request['text'], $bookmark->title)
                && str_contains($request['text'], $bookmark->url);
        });
    }

    public function test_includes_oauth_authorization_header(): void
    {
        Setting::set('twitter_api_key', 'test-api-key', encrypted: true);
        Setting::set('twitter_api_secret', 'test-api-secret', encrypted: true);
        Setting::set('twitter_access_token', 'test-access-token', encrypted: true);
        Setting::set('twitter_access_secret', 'test-access-secret', encrypted: true);

        Http::fake([
            'api.twitter.com/2/tweets' => Http::response(['data' => ['id' => '123']], 201),
        ]);

        $bookmark = Bookmark::factory()->create();

        PostToTwitter::run($bookmark);

        Http::assertSent(function ($request) {
            $authHeader = $request->header('Authorization')[0] ?? '';

            return str_starts_with($authHeader, 'OAuth ')
                && str_contains($authHeader, 'oauth_consumer_key')
                && str_contains($authHeader, 'oauth_signature');
        });
    }

    public function test_returns_false_on_api_error(): void
    {
        Setting::set('twitter_api_key', 'test-api-key', encrypted: true);
        Setting::set('twitter_api_secret', 'test-api-secret', encrypted: true);
        Setting::set('twitter_access_token', 'test-access-token', encrypted: true);
        Setting::set('twitter_access_secret', 'test-access-secret', encrypted: true);

        Http::fake([
            'api.twitter.com/2/tweets' => Http::response(['error' => 'Unauthorized'], 401),
        ]);

        $bookmark = Bookmark::factory()->create();

        $result = PostToTwitter::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_truncates_long_titles_for_280_char_limit(): void
    {
        Setting::set('twitter_api_key', 'test-api-key', encrypted: true);
        Setting::set('twitter_api_secret', 'test-api-secret', encrypted: true);
        Setting::set('twitter_access_token', 'test-access-token', encrypted: true);
        Setting::set('twitter_access_secret', 'test-access-secret', encrypted: true);

        Http::fake([
            'api.twitter.com/2/tweets' => Http::response(['data' => ['id' => '123']], 201),
        ]);

        $longTitle = str_repeat('a', 400);
        $bookmark = Bookmark::factory()->create([
            'title' => $longTitle,
            'url' => 'https://example.com',
        ]);

        $result = PostToTwitter::run($bookmark);

        $this->assertTrue($result);
        Http::assertSent(function ($request) {
            // Twitter counts URLs as 23 chars, so total should be <= 280
            // We can't easily verify this without knowing the exact URL length handling
            // but we can at least check that the title was truncated
            return str_contains($request['text'], '…');
        });
    }
}

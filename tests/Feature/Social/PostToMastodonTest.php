<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Actions\Social\PostToMastodon;
use App\Models\Bookmark;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PostToMastodonTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_false_when_credentials_not_configured(): void
    {
        $bookmark = Bookmark::factory()->create();

        $result = PostToMastodon::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_returns_false_when_only_instance_configured(): void
    {
        Setting::set('mastodon_instance', 'https://mastodon.social');

        $bookmark = Bookmark::factory()->create();

        $result = PostToMastodon::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_returns_false_when_only_token_configured(): void
    {
        Setting::set('mastodon_access_token', 'test-token', encrypted: true);

        $bookmark = Bookmark::factory()->create();

        $result = PostToMastodon::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_posts_to_mastodon_successfully(): void
    {
        Setting::set('mastodon_instance', 'https://mastodon.social');
        Setting::set('mastodon_access_token', 'test-token', encrypted: true);

        Http::fake([
            'mastodon.social/api/v1/statuses' => Http::response(['id' => '123'], 200),
        ]);

        $bookmark = Bookmark::factory()->create([
            'title' => 'Test Article',
            'url' => 'https://example.com/article',
        ]);

        $result = PostToMastodon::run($bookmark);

        $this->assertTrue($result);
        Http::assertSent(function ($request) use ($bookmark) {
            return $request->url() === 'https://mastodon.social/api/v1/statuses'
                && str_contains($request['status'], $bookmark->title)
                && str_contains($request['status'], $bookmark->url);
        });
    }

    public function test_normalizes_instance_url_without_protocol(): void
    {
        Setting::set('mastodon_instance', 'mastodon.social');
        Setting::set('mastodon_access_token', 'test-token', encrypted: true);

        Http::fake([
            'mastodon.social/api/v1/statuses' => Http::response(['id' => '123'], 200),
        ]);

        $bookmark = Bookmark::factory()->create();

        $result = PostToMastodon::run($bookmark);

        $this->assertTrue($result);
        Http::assertSent(fn ($request) => $request->url() === 'https://mastodon.social/api/v1/statuses');
    }

    public function test_normalizes_instance_url_with_trailing_slash(): void
    {
        Setting::set('mastodon_instance', 'https://mastodon.social/');
        Setting::set('mastodon_access_token', 'test-token', encrypted: true);

        Http::fake([
            'mastodon.social/api/v1/statuses' => Http::response(['id' => '123'], 200),
        ]);

        $bookmark = Bookmark::factory()->create();

        $result = PostToMastodon::run($bookmark);

        $this->assertTrue($result);
        Http::assertSent(fn ($request) => $request->url() === 'https://mastodon.social/api/v1/statuses');
    }

    public function test_returns_false_on_api_error(): void
    {
        Setting::set('mastodon_instance', 'https://mastodon.social');
        Setting::set('mastodon_access_token', 'test-token', encrypted: true);

        Http::fake([
            'mastodon.social/api/v1/statuses' => Http::response(['error' => 'Unauthorized'], 401),
        ]);

        $bookmark = Bookmark::factory()->create();

        $result = PostToMastodon::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_truncates_long_titles(): void
    {
        Setting::set('mastodon_instance', 'https://mastodon.social');
        Setting::set('mastodon_access_token', 'test-token', encrypted: true);

        Http::fake([
            'mastodon.social/api/v1/statuses' => Http::response(['id' => '123'], 200),
        ]);

        // Title is 490 chars (within DB limit of 500), but combined with URL (19 chars) + space
        // would exceed Mastodon's 500 char limit, triggering truncation
        $longTitle = str_repeat('a', 490);
        $bookmark = Bookmark::factory()->create([
            'title' => $longTitle,
            'url' => 'https://example.com',
        ]);

        $result = PostToMastodon::run($bookmark);

        $this->assertTrue($result);
        Http::assertSent(function ($request) {
            return mb_strlen($request['status']) <= 500;
        });
    }
}

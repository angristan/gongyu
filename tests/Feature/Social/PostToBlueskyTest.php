<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Actions\Social\PostToBluesky;
use App\Models\Bookmark;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PostToBlueskyTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_false_when_credentials_not_configured(): void
    {
        $bookmark = Bookmark::factory()->create();

        $result = PostToBluesky::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_returns_false_when_only_handle_configured(): void
    {
        Setting::set('bluesky_handle', 'test.bsky.social');

        $bookmark = Bookmark::factory()->create();

        $result = PostToBluesky::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_returns_false_when_only_password_configured(): void
    {
        Setting::set('bluesky_app_password', 'app-password', encrypted: true);

        $bookmark = Bookmark::factory()->create();

        $result = PostToBluesky::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_posts_to_bluesky_successfully(): void
    {
        Setting::set('bluesky_handle', 'test.bsky.social');
        Setting::set('bluesky_app_password', 'app-password', encrypted: true);

        Http::fake([
            'bsky.social/xrpc/com.atproto.server.createSession' => Http::response([
                'did' => 'did:plc:test123',
                'accessJwt' => 'test-jwt-token',
            ], 200),
            'bsky.social/xrpc/com.atproto.repo.createRecord' => Http::response([
                'uri' => 'at://did:plc:test123/app.bsky.feed.post/abc',
                'cid' => 'bafytest',
            ], 200),
        ]);

        $bookmark = Bookmark::factory()->create([
            'title' => 'Test Article',
            'url' => 'https://example.com/article',
        ]);

        $result = PostToBluesky::run($bookmark);

        $this->assertTrue($result);

        // Verify session creation
        Http::assertSent(function ($request) {
            return $request->url() === 'https://bsky.social/xrpc/com.atproto.server.createSession'
                && $request['identifier'] === 'test.bsky.social'
                && $request['password'] === 'app-password';
        });

        // Verify post creation
        Http::assertSent(function ($request) use ($bookmark) {
            if ($request->url() !== 'https://bsky.social/xrpc/com.atproto.repo.createRecord') {
                return false;
            }

            return $request['repo'] === 'did:plc:test123'
                && $request['collection'] === 'app.bsky.feed.post'
                && str_contains($request['record']['text'], $bookmark->title)
                && str_contains($request['record']['text'], $bookmark->url);
        });
    }

    public function test_creates_link_facets_for_url(): void
    {
        Setting::set('bluesky_handle', 'test.bsky.social');
        Setting::set('bluesky_app_password', 'app-password', encrypted: true);

        Http::fake([
            'bsky.social/xrpc/com.atproto.server.createSession' => Http::response([
                'did' => 'did:plc:test123',
                'accessJwt' => 'test-jwt-token',
            ], 200),
            'bsky.social/xrpc/com.atproto.repo.createRecord' => Http::response([
                'uri' => 'at://did:plc:test123/app.bsky.feed.post/abc',
            ], 200),
        ]);

        $bookmark = Bookmark::factory()->create([
            'title' => 'Test',
            'url' => 'https://example.com',
        ]);

        PostToBluesky::run($bookmark);

        Http::assertSent(function ($request) use ($bookmark) {
            if ($request->url() !== 'https://bsky.social/xrpc/com.atproto.repo.createRecord') {
                return false;
            }

            $facets = $request['record']['facets'] ?? [];
            if (empty($facets)) {
                return false;
            }

            $linkFacet = $facets[0] ?? null;

            return $linkFacet
                && isset($linkFacet['features'][0]['$type'])
                && $linkFacet['features'][0]['$type'] === 'app.bsky.richtext.facet#link'
                && $linkFacet['features'][0]['uri'] === $bookmark->url;
        });
    }

    public function test_returns_false_when_session_creation_fails(): void
    {
        Setting::set('bluesky_handle', 'test.bsky.social');
        Setting::set('bluesky_app_password', 'wrong-password', encrypted: true);

        Http::fake([
            'bsky.social/xrpc/com.atproto.server.createSession' => Http::response([
                'error' => 'AuthenticationRequired',
                'message' => 'Invalid identifier or password',
            ], 401),
        ]);

        $bookmark = Bookmark::factory()->create();

        $result = PostToBluesky::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_returns_false_when_post_creation_fails(): void
    {
        Setting::set('bluesky_handle', 'test.bsky.social');
        Setting::set('bluesky_app_password', 'app-password', encrypted: true);

        Http::fake([
            'bsky.social/xrpc/com.atproto.server.createSession' => Http::response([
                'did' => 'did:plc:test123',
                'accessJwt' => 'test-jwt-token',
            ], 200),
            'bsky.social/xrpc/com.atproto.repo.createRecord' => Http::response([
                'error' => 'InvalidRequest',
            ], 400),
        ]);

        $bookmark = Bookmark::factory()->create();

        $result = PostToBluesky::run($bookmark);

        $this->assertFalse($result);
    }

    public function test_truncates_long_titles(): void
    {
        Setting::set('bluesky_handle', 'test.bsky.social');
        Setting::set('bluesky_app_password', 'app-password', encrypted: true);

        Http::fake([
            'bsky.social/xrpc/com.atproto.server.createSession' => Http::response([
                'did' => 'did:plc:test123',
                'accessJwt' => 'test-jwt-token',
            ], 200),
            'bsky.social/xrpc/com.atproto.repo.createRecord' => Http::response([
                'uri' => 'at://did:plc:test123/app.bsky.feed.post/abc',
            ], 200),
        ]);

        $longTitle = str_repeat('a', 400);
        $bookmark = Bookmark::factory()->create([
            'title' => $longTitle,
            'url' => 'https://example.com',
        ]);

        $result = PostToBluesky::run($bookmark);

        $this->assertTrue($result);
        Http::assertSent(function ($request) {
            if ($request->url() !== 'https://bsky.social/xrpc/com.atproto.repo.createRecord') {
                return false;
            }

            return mb_strlen($request['record']['text']) <= 300;
        });
    }
}

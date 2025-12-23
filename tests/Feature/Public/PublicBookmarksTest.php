<?php

declare(strict_types=1);

namespace Tests\Feature\Public;

use App\Models\Bookmark;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicBookmarksTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_index_is_accessible(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
    }

    public function test_public_index_shows_bookmarks(): void
    {
        $bookmark = Bookmark::factory()->create(['title' => 'Test Bookmark']);

        $response = $this->get('/');

        $response->assertStatus(200);
    }

    public function test_single_bookmark_is_accessible_by_short_url(): void
    {
        $bookmark = Bookmark::factory()->create();

        $response = $this->get("/b/{$bookmark->short_url}");

        $response->assertStatus(200);
    }

    public function test_nonexistent_bookmark_returns_404(): void
    {
        $response = $this->get('/b/nonexistent');

        $response->assertStatus(404);
    }

    public function test_legacy_shaarli_url_redirects_to_new_url(): void
    {
        $bookmark = Bookmark::factory()->create(['shaarli_short_url' => 'WDWyig']);

        $response = $this->get('/shaare/WDWyig');

        $response->assertRedirect("/b/{$bookmark->short_url}");
        $response->assertStatus(301);
    }

    public function test_legacy_shaarli_url_returns_404_if_not_found(): void
    {
        $response = $this->get('/shaare/nonexistent');

        $response->assertStatus(404);
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Bookmark;

use App\Models\Bookmark;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookmarkTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
    }

    public function test_bookmarks_list_requires_authentication(): void
    {
        $response = $this->get('/admin/bookmarks');

        $response->assertRedirect('/login');
    }

    public function test_authenticated_user_can_view_bookmarks_list(): void
    {
        $response = $this->actingAs($this->user)->get('/admin/bookmarks');

        $response->assertStatus(200);
    }

    public function test_user_can_create_bookmark(): void
    {
        $response = $this->actingAs($this->user)->post('/admin/bookmarks', [
            'url' => 'https://example.com/article',
            'title' => 'Test Article',
            'description' => 'A test description',
        ]);

        $response->assertRedirect(route('admin.bookmarks.index'));
        $this->assertDatabaseHas('bookmarks', [
            'url' => 'https://example.com/article',
            'title' => 'Test Article',
        ]);
    }

    public function test_bookmark_generates_short_url(): void
    {
        $this->actingAs($this->user)->post('/admin/bookmarks', [
            'url' => 'https://example.com/article',
            'title' => 'Test Article',
        ]);

        $bookmark = Bookmark::first();
        $this->assertNotNull($bookmark->short_url);
        $this->assertEquals(8, strlen($bookmark->short_url));
    }

    public function test_user_can_update_bookmark(): void
    {
        $bookmark = Bookmark::factory()->create();

        $response = $this->actingAs($this->user)->patch("/admin/bookmarks/{$bookmark->short_url}", [
            'url' => 'https://example.com/updated',
            'title' => 'Updated Title',
            'description' => 'Updated description',
        ]);

        $response->assertRedirect(route('admin.bookmarks.index'));
        $this->assertDatabaseHas('bookmarks', [
            'id' => $bookmark->id,
            'title' => 'Updated Title',
        ]);
    }

    public function test_user_can_delete_bookmark(): void
    {
        $bookmark = Bookmark::factory()->create();

        $response = $this->actingAs($this->user)->delete("/admin/bookmarks/{$bookmark->short_url}");

        $response->assertRedirect(route('admin.bookmarks.index'));
        $this->assertDatabaseMissing('bookmarks', [
            'id' => $bookmark->id,
        ]);
    }

    public function test_duplicate_url_is_rejected(): void
    {
        Bookmark::factory()->create(['url' => 'https://example.com/existing']);

        $response = $this->actingAs($this->user)->post('/admin/bookmarks', [
            'url' => 'https://example.com/existing',
            'title' => 'Duplicate',
        ]);

        $response->assertSessionHasErrors(['url']);
    }
}

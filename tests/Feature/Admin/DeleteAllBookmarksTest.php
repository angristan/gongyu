<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Actions\Admin\DeleteAllBookmarks;
use App\Models\Bookmark;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeleteAllBookmarksTest extends TestCase
{
    use RefreshDatabase;

    public function test_deletes_all_bookmarks(): void
    {
        Bookmark::factory()->count(5)->create();

        $this->assertCount(5, Bookmark::all());

        $result = DeleteAllBookmarks::run();

        $this->assertEquals(5, $result['deleted']);
        $this->assertCount(0, Bookmark::all());
    }

    public function test_returns_zero_when_no_bookmarks(): void
    {
        $result = DeleteAllBookmarks::run();

        $this->assertEquals(0, $result['deleted']);
    }

    public function test_requires_authentication(): void
    {
        $response = $this->delete('/admin/bookmarks/all', [
            'confirmation' => 'DELETE ALL BOOKMARKS',
        ]);

        $response->assertRedirect('/login');
    }

    public function test_requires_confirmation_text(): void
    {
        $user = User::factory()->create();
        Bookmark::factory()->count(3)->create();

        $response = $this->actingAs($user)->delete('/admin/bookmarks/all', [
            'confirmation' => 'wrong text',
        ]);

        $response->assertSessionHasErrors('confirmation');
        $this->assertCount(3, Bookmark::all());
    }

    public function test_deletes_via_controller_with_correct_confirmation(): void
    {
        $user = User::factory()->create();
        Bookmark::factory()->count(3)->create();

        $response = $this->actingAs($user)->delete('/admin/bookmarks/all', [
            'confirmation' => 'DELETE ALL BOOKMARKS',
        ]);

        $response->assertRedirect(route('admin.settings', ['tab' => 'danger']));
        $response->assertSessionHas('deleteResult');

        $result = session('deleteResult');
        $this->assertEquals(3, $result['deleted']);
        $this->assertCount(0, Bookmark::all());
    }

    public function test_confirmation_is_case_sensitive(): void
    {
        $user = User::factory()->create();
        Bookmark::factory()->count(3)->create();

        $response = $this->actingAs($user)->delete('/admin/bookmarks/all', [
            'confirmation' => 'delete all bookmarks',
        ]);

        $response->assertSessionHasErrors('confirmation');
        $this->assertCount(3, Bookmark::all());
    }
}

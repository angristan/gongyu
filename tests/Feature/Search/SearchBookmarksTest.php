<?php

declare(strict_types=1);

namespace Tests\Feature\Search;

use App\Actions\Search\SearchBookmarks;
use App\Models\Bookmark;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SearchBookmarksTest extends TestCase
{
    use RefreshDatabase;

    public function test_finds_bookmarks_by_title(): void
    {
        Bookmark::factory()->create(['title' => 'Laravel Framework Guide']);
        Bookmark::factory()->create(['title' => 'React Tutorial']);
        Bookmark::factory()->create(['title' => 'Vue.js Basics']);

        $results = SearchBookmarks::run('Laravel');

        $this->assertCount(1, $results);
        $this->assertEquals('Laravel Framework Guide', $results->first()->title);
    }

    public function test_finds_bookmarks_by_description(): void
    {
        Bookmark::factory()->create([
            'title' => 'Some Article',
            'description' => 'This article covers PostgreSQL database optimization',
        ]);
        Bookmark::factory()->create([
            'title' => 'Another Article',
            'description' => 'MySQL tips and tricks',
        ]);

        $results = SearchBookmarks::run('PostgreSQL');

        $this->assertCount(1, $results);
        $this->assertEquals('Some Article', $results->first()->title);
    }

    public function test_finds_bookmarks_by_url(): void
    {
        Bookmark::factory()->create([
            'title' => 'GitHub Repo',
            'url' => 'https://github.com/laravel/framework',
        ]);
        Bookmark::factory()->create([
            'title' => 'GitLab Repo',
            'url' => 'https://gitlab.com/some/project',
        ]);

        $results = SearchBookmarks::run('github');

        $this->assertCount(1, $results);
        $this->assertEquals('GitHub Repo', $results->first()->title);
    }

    public function test_new_bookmarks_are_immediately_searchable(): void
    {
        // Create bookmark - triggers should update FTS index
        $bookmark = Bookmark::create([
            'url' => 'https://example.com/unique-searchable-content',
            'title' => 'Unique Searchable Title XYZ123',
        ]);

        // Should be findable immediately
        $results = SearchBookmarks::run('XYZ123');

        $this->assertCount(1, $results);
        $this->assertEquals($bookmark->id, $results->first()->id);
    }

    public function test_updated_bookmarks_reflect_changes_in_search(): void
    {
        $bookmark = Bookmark::factory()->create([
            'title' => 'Original Title ABC',
        ]);

        // Verify original is searchable
        $this->assertCount(1, SearchBookmarks::run('ABC'));
        $this->assertCount(0, SearchBookmarks::run('Updated'));

        // Update the bookmark
        $bookmark->update(['title' => 'Updated Title DEF']);

        // Old term should not find it, new term should
        $this->assertCount(0, SearchBookmarks::run('ABC'));
        $this->assertCount(1, SearchBookmarks::run('DEF'));
    }

    public function test_deleted_bookmarks_not_in_search_results(): void
    {
        $bookmark = Bookmark::factory()->create([
            'title' => 'Temporary Bookmark QRS',
        ]);

        // Verify it's searchable
        $this->assertCount(1, SearchBookmarks::run('QRS'));

        // Delete it
        $bookmark->delete();

        // Should no longer be found
        $this->assertCount(0, SearchBookmarks::run('QRS'));
    }

    public function test_search_is_case_insensitive(): void
    {
        Bookmark::factory()->create(['title' => 'JavaScript Tutorial']);

        $this->assertCount(1, SearchBookmarks::run('javascript'));
        $this->assertCount(1, SearchBookmarks::run('JAVASCRIPT'));
        $this->assertCount(1, SearchBookmarks::run('JavaScript'));
    }

    public function test_search_with_multiple_words(): void
    {
        Bookmark::factory()->create([
            'title' => 'Advanced PHP Programming',
            'description' => 'Learn advanced techniques',
        ]);
        Bookmark::factory()->create([
            'title' => 'Basic PHP Tutorial',
        ]);

        $results = SearchBookmarks::run('advanced PHP');

        $this->assertCount(1, $results);
        $this->assertEquals('Advanced PHP Programming', $results->first()->title);
    }

    public function test_empty_search_returns_all_bookmarks(): void
    {
        Bookmark::factory()->count(5)->create();

        $results = SearchBookmarks::run('');

        $this->assertCount(5, $results);
    }

    public function test_no_results_for_nonexistent_term(): void
    {
        Bookmark::factory()->count(3)->create();

        $results = SearchBookmarks::run('xyznonexistent123');

        $this->assertCount(0, $results);
    }
}

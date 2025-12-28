<?php

declare(strict_types=1);

namespace Tests\Feature\Import;

use App\Actions\Import\BookmarkImporter;
use App\Models\Bookmark;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookmarkImporterTest extends TestCase
{
    use RefreshDatabase;

    public function test_imports_bookmarks_from_array(): void
    {
        $bookmarks = [
            [
                'url' => 'https://example.com/1',
                'title' => 'Example 1',
                'description' => 'Description 1',
                'shaarli_short_url' => 'abc123',
                'created_at' => 1703350800,
            ],
            [
                'url' => 'https://example.com/2',
                'title' => 'Example 2',
                'description' => null,
                'shaarli_short_url' => 'def456',
                'created_at' => 1703350900,
            ],
        ];

        $result = BookmarkImporter::run($bookmarks);

        $this->assertEquals(2, $result['imported']);
        $this->assertEquals(0, $result['skipped']);
        $this->assertEmpty($result['errors']);
        $this->assertCount(2, Bookmark::all());

        $bookmark1 = Bookmark::where('url', 'https://example.com/1')->first();
        $this->assertEquals('Example 1', $bookmark1->title);
        $this->assertEquals('Description 1', $bookmark1->description);
        $this->assertEquals('abc123', $bookmark1->shaarli_short_url);
    }

    public function test_skips_duplicate_urls(): void
    {
        $bookmarks = [
            ['url' => 'https://example.com/same', 'title' => 'First'],
            ['url' => 'https://example.com/same', 'title' => 'Second'],
        ];

        $result = BookmarkImporter::run($bookmarks);

        $this->assertEquals(1, $result['imported']);
        $this->assertEquals(1, $result['skipped']);
        $this->assertCount(1, Bookmark::all());
        $this->assertEquals('First', Bookmark::first()->title);
    }

    public function test_skips_existing_urls_in_database(): void
    {
        Bookmark::factory()->create(['url' => 'https://example.com/existing']);

        $bookmarks = [
            ['url' => 'https://example.com/existing', 'title' => 'Duplicate'],
            ['url' => 'https://example.com/new', 'title' => 'New'],
        ];

        $result = BookmarkImporter::run($bookmarks);

        $this->assertEquals(1, $result['imported']);
        $this->assertEquals(1, $result['skipped']);
        $this->assertCount(2, Bookmark::all());
    }

    public function test_handles_empty_array(): void
    {
        $result = BookmarkImporter::run([]);

        $this->assertEquals(0, $result['imported']);
        $this->assertEquals(0, $result['skipped']);
        $this->assertEmpty($result['errors']);
    }

    public function test_reports_error_for_missing_url(): void
    {
        $bookmarks = [
            ['title' => 'No URL bookmark'],
        ];

        $result = BookmarkImporter::run($bookmarks);

        $this->assertEquals(0, $result['imported']);
        $this->assertCount(1, $result['errors']);
        $this->assertStringContainsString('missing URL', $result['errors'][0]);
    }

    public function test_normalizes_various_timestamp_formats(): void
    {
        $bookmarks = [
            [
                'url' => 'https://example.com/1',
                'title' => 'Unix timestamp',
                'created_at' => 1703350800,
            ],
            [
                'url' => 'https://example.com/2',
                'title' => 'ISO string',
                'created_at' => '2023-12-23T15:00:00+00:00',
            ],
            [
                'url' => 'https://example.com/3',
                'title' => 'Carbon instance',
                'created_at' => Carbon::parse('2023-12-23 15:00:00'),
            ],
            [
                'url' => 'https://example.com/4',
                'title' => 'Null timestamp',
                'created_at' => null,
            ],
        ];

        $result = BookmarkImporter::run($bookmarks);

        $this->assertEquals(4, $result['imported']);
        $this->assertCount(4, Bookmark::all());
    }

    public function test_generates_unique_short_urls(): void
    {
        $bookmarks = [
            ['url' => 'https://example.com/1', 'title' => 'First'],
            ['url' => 'https://example.com/2', 'title' => 'Second'],
        ];

        BookmarkImporter::run($bookmarks);

        $shortUrls = Bookmark::pluck('short_url')->toArray();
        $this->assertCount(2, array_unique($shortUrls));
        $this->assertEquals(8, strlen($shortUrls[0]));
    }
}

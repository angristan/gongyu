<?php

declare(strict_types=1);

namespace Tests\Feature\Import;

use App\Actions\Import\ImportShaarliExport;
use App\Models\Bookmark;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ShaarliImportTest extends TestCase
{
    use RefreshDatabase;

    public function test_import_creates_bookmarks(): void
    {
        $html = $this->makeNetscapeHtml([
            ['url' => 'https://example.com/1', 'title' => 'Example 1', 'description' => 'Desc 1'],
            ['url' => 'https://example.com/2', 'title' => 'Example 2', 'description' => 'Desc 2'],
        ]);

        $file = UploadedFile::fake()->createWithContent('bookmarks.html', $html);

        $result = (new ImportShaarliExport)->handle($file);

        $this->assertEquals(2, $result['imported']);
        $this->assertEquals(0, $result['skipped']);
        $this->assertCount(2, Bookmark::all());
    }

    public function test_import_skips_duplicate_urls_in_same_file(): void
    {
        $html = $this->makeNetscapeHtml([
            ['url' => 'https://example.com/same', 'title' => 'First', 'description' => ''],
            ['url' => 'https://example.com/same', 'title' => 'Second', 'description' => ''],
            ['url' => 'https://example.com/same', 'title' => 'Third', 'description' => ''],
        ]);

        $file = UploadedFile::fake()->createWithContent('bookmarks.html', $html);

        $result = (new ImportShaarliExport)->handle($file);

        $this->assertEquals(1, $result['imported']);
        $this->assertEquals(2, $result['skipped']);
        $this->assertCount(1, Bookmark::all());
        $this->assertEquals('First', Bookmark::first()->title);
    }

    public function test_import_skips_existing_urls_in_database(): void
    {
        Bookmark::factory()->create(['url' => 'https://example.com/existing']);

        $html = $this->makeNetscapeHtml([
            ['url' => 'https://example.com/existing', 'title' => 'Duplicate', 'description' => ''],
            ['url' => 'https://example.com/new', 'title' => 'New', 'description' => ''],
        ]);

        $file = UploadedFile::fake()->createWithContent('bookmarks.html', $html);

        $result = (new ImportShaarliExport)->handle($file);

        $this->assertEquals(1, $result['imported']);
        $this->assertEquals(1, $result['skipped']);
        $this->assertCount(2, Bookmark::all());
    }

    public function test_import_page_requires_auth(): void
    {
        $response = $this->get('/admin/import');

        $response->assertRedirect('/login');
    }

    public function test_import_page_accessible_when_authenticated(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/admin/import');

        $response->assertOk();
    }

    private function makeNetscapeHtml(array $bookmarks): string
    {
        $html = "<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n";

        foreach ($bookmarks as $bookmark) {
            $timestamp = $bookmark['timestamp'] ?? time();
            $html .= sprintf(
                '<DT><A HREF="%s" ADD_DATE="%d">%s</A>',
                htmlspecialchars($bookmark['url']),
                $timestamp,
                htmlspecialchars($bookmark['title'])
            );
            if (! empty($bookmark['description'])) {
                $html .= sprintf("\n<DD>%s", htmlspecialchars($bookmark['description']));
            }
            $html .= "\n";
        }

        $html .= "</DL><p>\n";

        return $html;
    }
}

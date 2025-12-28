<?php

declare(strict_types=1);

namespace Tests\Feature\Import;

use App\Actions\Import\ImportShaarliExport;
use App\Models\Bookmark;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
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

    public function test_import_page_redirects_to_settings(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/admin/import');

        $response->assertRedirect(route('admin.settings', ['tab' => 'import']));
    }

    public function test_import_html_via_controller(): void
    {
        $user = User::factory()->create();
        $html = $this->makeNetscapeHtml([
            ['url' => 'https://example.com/1', 'title' => 'Example 1', 'description' => 'Desc 1'],
        ]);

        $file = UploadedFile::fake()->createWithContent('bookmarks.html', $html);

        $response = $this->actingAs($user)->post('/admin/import', [
            'import_type' => 'html',
            'file' => $file,
        ]);

        $response->assertRedirect(route('admin.settings', ['tab' => 'import']));
        $response->assertSessionHas('importResult');
        $this->assertCount(1, Bookmark::all());
    }

    public function test_import_datastore_via_controller(): void
    {
        $user = User::factory()->create();
        $content = $this->createTestDatastore([
            ['id' => 1, 'shortUrl' => 'abc123', 'url' => 'https://example.com/1', 'title' => 'Example 1', 'description' => 'Desc 1'],
            ['id' => 2, 'shortUrl' => 'def456', 'url' => 'https://example.com/2', 'title' => 'Example 2', 'description' => ''],
        ]);

        $file = UploadedFile::fake()->createWithContent('datastore.php', $content);

        $response = $this->actingAs($user)->post('/admin/import', [
            'import_type' => 'datastore',
            'file' => $file,
        ]);

        $response->assertRedirect(route('admin.settings', ['tab' => 'import']));
        $response->assertSessionHas('importResult');

        $result = session('importResult');
        $this->assertEquals(2, $result['imported']);

        $this->assertCount(2, Bookmark::all());
        $this->assertEquals('abc123', Bookmark::where('url', 'https://example.com/1')->first()->shaarli_short_url);
    }

    public function test_import_datastore_with_invalid_file(): void
    {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->createWithContent('datastore.php', 'invalid content');

        $response = $this->actingAs($user)->post('/admin/import', [
            'import_type' => 'datastore',
            'file' => $file,
        ]);

        $response->assertRedirect(route('admin.settings', ['tab' => 'import']));
        $response->assertSessionHas('importResult');

        $result = session('importResult');
        $this->assertEquals(0, $result['imported']);
        $this->assertNotEmpty($result['errors']);
    }

    public function test_import_api_via_controller(): void
    {
        $user = User::factory()->create();

        Http::fake([
            'https://links.example.com/api/v1/links*' => Http::response([
                [
                    'id' => 1,
                    'url' => 'https://example.com/1',
                    'shorturl' => 'abc123',
                    'title' => 'Example 1',
                    'description' => 'Description 1',
                    'tags' => [],
                    'private' => false,
                    'created' => '2023-12-23T15:00:00+00:00',
                    'updated' => '',
                ],
            ], 200),
        ]);

        $response = $this->actingAs($user)->post('/admin/import', [
            'import_type' => 'api',
            'shaarli_url' => 'https://links.example.com',
            'api_secret' => 'test-api-secret-key-12345',
        ]);

        $response->assertRedirect(route('admin.settings', ['tab' => 'import']));
        $response->assertSessionHas('importResult');

        $result = session('importResult');
        $this->assertEquals(1, $result['imported']);

        $bookmark = Bookmark::first();
        $this->assertEquals('https://example.com/1', $bookmark->url);
        $this->assertEquals('abc123', $bookmark->shaarli_short_url);
    }

    public function test_import_api_with_authentication_failure(): void
    {
        $user = User::factory()->create();

        Http::fake([
            'https://links.example.com/api/v1/links*' => Http::response(['error' => 'Unauthorized'], 401),
        ]);

        $response = $this->actingAs($user)->post('/admin/import', [
            'import_type' => 'api',
            'shaarli_url' => 'https://links.example.com',
            'api_secret' => 'wrong-secret-key-12345',
        ]);

        $response->assertRedirect(route('admin.settings', ['tab' => 'import']));
        $response->assertSessionHas('importResult');

        $result = session('importResult');
        $this->assertEquals(0, $result['imported']);
        $this->assertNotEmpty($result['errors']);
        $this->assertStringContainsString('Authentication failed', $result['errors'][0]);
    }

    public function test_import_api_validates_url(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/admin/import', [
            'import_type' => 'api',
            'shaarli_url' => 'not-a-valid-url',
            'api_secret' => 'test-api-secret-key-12345',
        ]);

        $response->assertSessionHasErrors('shaarli_url');
    }

    public function test_import_api_validates_secret_length(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/admin/import', [
            'import_type' => 'api',
            'shaarli_url' => 'https://links.example.com',
            'api_secret' => 'short',
        ]);

        $response->assertSessionHasErrors('api_secret');
    }

    public function test_import_gongyu_via_controller(): void
    {
        $user = User::factory()->create();
        $data = [
            'exported_at' => '2025-12-28T12:00:00Z',
            'version' => '1.0',
            'count' => 2,
            'bookmarks' => [
                [
                    'id' => 1,
                    'url' => 'https://example.com/1',
                    'title' => 'Example 1',
                    'description' => 'Description 1',
                    'short_url' => 'abc12345',
                    'shaarli_short_url' => 'xyz789',
                    'thumbnail_url' => 'https://example.com/thumb1.jpg',
                    'created_at' => '2025-01-01T00:00:00Z',
                    'updated_at' => '2025-01-02T00:00:00Z',
                ],
                [
                    'id' => 2,
                    'url' => 'https://example.com/2',
                    'title' => 'Example 2',
                    'description' => null,
                    'short_url' => 'def67890',
                    'shaarli_short_url' => null,
                    'thumbnail_url' => null,
                    'created_at' => '2025-01-03T00:00:00Z',
                    'updated_at' => '2025-01-03T00:00:00Z',
                ],
            ],
        ];

        $file = UploadedFile::fake()->createWithContent('export.json', json_encode($data));

        $response = $this->actingAs($user)->post('/admin/import', [
            'import_type' => 'gongyu',
            'file' => $file,
        ]);

        $response->assertRedirect(route('admin.settings', ['tab' => 'import']));
        $response->assertSessionHas('importResult');

        $result = session('importResult');
        $this->assertEquals(2, $result['imported']);

        $this->assertCount(2, Bookmark::all());

        $bookmark1 = Bookmark::where('url', 'https://example.com/1')->first();
        $this->assertEquals('Example 1', $bookmark1->title);
        $this->assertEquals('abc12345', $bookmark1->short_url);
        $this->assertEquals('xyz789', $bookmark1->shaarli_short_url);
        $this->assertEquals('https://example.com/thumb1.jpg', $bookmark1->thumbnail_url);

        $bookmark2 = Bookmark::where('url', 'https://example.com/2')->first();
        $this->assertEquals('def67890', $bookmark2->short_url);
        $this->assertNull($bookmark2->shaarli_short_url);
    }

    public function test_import_gongyu_with_invalid_json(): void
    {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->createWithContent('export.json', 'not valid json');

        $response = $this->actingAs($user)->post('/admin/import', [
            'import_type' => 'gongyu',
            'file' => $file,
        ]);

        $response->assertRedirect(route('admin.settings', ['tab' => 'import']));
        $response->assertSessionHas('importResult');

        $result = session('importResult');
        $this->assertEquals(0, $result['imported']);
        $this->assertNotEmpty($result['errors']);
        $this->assertStringContainsString('Invalid JSON', $result['errors'][0]);
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

    /**
     * Create a test datastore file content for controller tests.
     */
    private function createTestDatastore(array $bookmarksData): string
    {
        $bookmarks = [];
        foreach ($bookmarksData as $data) {
            $bookmarks[] = $this->serializeBookmark($data);
        }

        $bookmarksStr = implode('', $bookmarks);
        $bookmarkCount = count($bookmarksData);

        $outerSerialized = 'O:8:"stdClass":1:{s:12:"'."\0*\0".'bookmarks";a:'.$bookmarkCount.':{'.$bookmarksStr.'}}';

        $compressed = gzdeflate($outerSerialized);
        $encoded = base64_encode($compressed);

        return '<'.'?php /* '.$encoded.' */ ?'.'>';
    }

    private function serializeBookmark(array $data): string
    {
        $idx = $data['id'] - 1;
        $parts = [];

        $parts[] = 's:5:"'."\0*\0".'id";i:'.$data['id'].';';
        $parts[] = 's:11:"'."\0*\0".'shortUrl";s:'.strlen($data['shortUrl']).':"'.$data['shortUrl'].'";';
        $parts[] = 's:6:"'."\0*\0".'url";s:'.strlen($data['url']).':"'.$data['url'].'";';
        $parts[] = 's:8:"'."\0*\0".'title";s:'.strlen($data['title']).':"'.$data['title'].'";';
        $parts[] = 's:14:"'."\0*\0".'description";s:'.strlen($data['description']).':"'.$data['description'].'";';

        $content = implode('', $parts);

        return 'i:'.$idx.';O:8:"stdClass":5:{'.$content.'}';
    }
}

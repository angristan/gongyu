<?php

declare(strict_types=1);

namespace Tests\Feature\Export;

use App\Actions\Export\GenerateJsonExport;
use App\Actions\Export\GenerateNetscapeExport;
use App\Models\Bookmark;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExportBookmarksTest extends TestCase
{
    use RefreshDatabase;

    public function test_export_page_requires_auth(): void
    {
        $response = $this->get('/admin/export');

        $response->assertRedirect('/login');
    }

    public function test_exports_html_format(): void
    {
        $user = User::factory()->create();
        Bookmark::factory()->create([
            'url' => 'https://example.com/test',
            'title' => 'Test Bookmark',
            'description' => 'Test description',
            'short_url' => 'abc12345',
            'shaarli_short_url' => 'xyz789',
        ]);

        $response = $this->actingAs($user)->get('/admin/export?format=html');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/html; charset=utf-8');
        $this->assertStringStartsWith('attachment; filename="bookmarks_', $response->headers->get('Content-Disposition'));
        $this->assertStringEndsWith('.html"', $response->headers->get('Content-Disposition'));

        $content = $response->getContent();
        $this->assertStringContainsString('<!DOCTYPE NETSCAPE-Bookmark-file-1>', $content);
        $this->assertStringContainsString('https://example.com/test', $content);
        $this->assertStringContainsString('Test Bookmark', $content);
        $this->assertStringContainsString('Test description', $content);
        $this->assertStringContainsString('SHORTURL="abc12345"', $content);
        $this->assertStringContainsString('SHAARLI_SHORTURL="xyz789"', $content);
    }

    public function test_exports_json_format(): void
    {
        $user = User::factory()->create();
        Bookmark::factory()->create([
            'url' => 'https://example.com/test',
            'title' => 'Test Bookmark',
            'short_url' => 'abc12345',
            'shaarli_short_url' => 'xyz789',
        ]);

        $response = $this->actingAs($user)->get('/admin/export?format=json');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/json; charset=utf-8');

        $data = json_decode($response->getContent(), true);
        $this->assertArrayHasKey('exported_at', $data);
        $this->assertArrayHasKey('version', $data);
        $this->assertArrayHasKey('count', $data);
        $this->assertArrayHasKey('bookmarks', $data);
        $this->assertEquals(1, $data['count']);
        $this->assertEquals('https://example.com/test', $data['bookmarks'][0]['url']);
        $this->assertEquals('abc12345', $data['bookmarks'][0]['short_url']);
        $this->assertEquals('xyz789', $data['bookmarks'][0]['shaarli_short_url']);
    }

    public function test_defaults_to_html_format(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/admin/export');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/html; charset=utf-8');
    }

    public function test_netscape_export_generates_valid_html(): void
    {
        Bookmark::factory()->count(3)->create();

        $html = GenerateNetscapeExport::run();

        $this->assertStringContainsString('<!DOCTYPE NETSCAPE-Bookmark-file-1>', $html);
        $this->assertStringContainsString('<TITLE>Bookmarks Export</TITLE>', $html);
        $this->assertStringContainsString('<DL><p>', $html);
        $this->assertStringContainsString('</DL><p>', $html);

        // Should have 3 bookmark entries
        $this->assertEquals(3, substr_count($html, '<DT><A HREF='));
    }

    public function test_netscape_export_escapes_html_entities(): void
    {
        Bookmark::factory()->create([
            'url' => 'https://example.com/test?foo=bar&baz=qux',
            'title' => 'Test <script>alert("xss")</script>',
            'description' => 'Description with "quotes" & ampersands',
        ]);

        $html = GenerateNetscapeExport::run();

        $this->assertStringContainsString('foo=bar&amp;baz=qux', $html);
        $this->assertStringContainsString('&lt;script&gt;', $html);
        $this->assertStringContainsString('&quot;quotes&quot;', $html);
        $this->assertStringNotContainsString('<script>', $html);
    }

    public function test_json_export_includes_all_fields(): void
    {
        $bookmark = Bookmark::factory()->create([
            'url' => 'https://example.com/test',
            'title' => 'Test',
            'description' => 'Description',
            'short_url' => 'abc12345',
            'shaarli_short_url' => 'xyz789',
            'thumbnail_url' => 'https://example.com/thumb.jpg',
        ]);

        $json = GenerateJsonExport::run();
        $data = json_decode($json, true);

        $exported = $data['bookmarks'][0];
        $this->assertEquals($bookmark->id, $exported['id']);
        $this->assertEquals($bookmark->url, $exported['url']);
        $this->assertEquals($bookmark->title, $exported['title']);
        $this->assertEquals($bookmark->description, $exported['description']);
        $this->assertEquals($bookmark->short_url, $exported['short_url']);
        $this->assertEquals($bookmark->shaarli_short_url, $exported['shaarli_short_url']);
        $this->assertEquals($bookmark->thumbnail_url, $exported['thumbnail_url']);
        $this->assertNotNull($exported['created_at']);
        $this->assertNotNull($exported['updated_at']);
    }

    public function test_export_handles_empty_database(): void
    {
        $html = GenerateNetscapeExport::run();
        $json = GenerateJsonExport::run();

        $this->assertStringContainsString('<!DOCTYPE NETSCAPE-Bookmark-file-1>', $html);
        $this->assertEquals(0, substr_count($html, '<DT><A HREF='));

        $data = json_decode($json, true);
        $this->assertEquals(0, $data['count']);
        $this->assertEmpty($data['bookmarks']);
    }
}

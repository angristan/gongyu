<?php

declare(strict_types=1);

namespace Tests\Feature\Import;

use App\Actions\Import\ParseGongyuExport;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ParseGongyuExportTest extends TestCase
{
    public function test_parses_gongyu_export(): void
    {
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

        $result = ParseGongyuExport::run($file);

        $this->assertCount(2, $result);

        $this->assertEquals('https://example.com/1', $result[0]['url']);
        $this->assertEquals('Example 1', $result[0]['title']);
        $this->assertEquals('Description 1', $result[0]['description']);
        $this->assertEquals('abc12345', $result[0]['short_url']);
        $this->assertEquals('xyz789', $result[0]['shaarli_short_url']);
        $this->assertEquals('https://example.com/thumb1.jpg', $result[0]['thumbnail_url']);

        $this->assertEquals('https://example.com/2', $result[1]['url']);
        $this->assertNull($result[1]['shaarli_short_url']);
    }

    public function test_throws_on_invalid_json(): void
    {
        $file = UploadedFile::fake()->createWithContent('export.json', 'not valid json');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid JSON format');

        ParseGongyuExport::run($file);
    }

    public function test_throws_on_missing_bookmarks_array(): void
    {
        $data = ['exported_at' => '2025-12-28T12:00:00Z'];
        $file = UploadedFile::fake()->createWithContent('export.json', json_encode($data));

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('missing bookmarks array');

        ParseGongyuExport::run($file);
    }

    public function test_skips_bookmarks_without_url(): void
    {
        $data = [
            'bookmarks' => [
                ['url' => 'https://example.com/valid', 'title' => 'Valid'],
                ['url' => '', 'title' => 'Empty URL'],
                ['title' => 'Missing URL'],
            ],
        ];

        $file = UploadedFile::fake()->createWithContent('export.json', json_encode($data));

        $result = ParseGongyuExport::run($file);

        $this->assertCount(1, $result);
        $this->assertEquals('https://example.com/valid', $result[0]['url']);
    }

    public function test_uses_url_as_title_fallback(): void
    {
        $data = [
            'bookmarks' => [
                ['url' => 'https://example.com/no-title'],
            ],
        ];

        $file = UploadedFile::fake()->createWithContent('export.json', json_encode($data));

        $result = ParseGongyuExport::run($file);

        $this->assertEquals('https://example.com/no-title', $result[0]['title']);
    }
}

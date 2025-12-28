<?php

declare(strict_types=1);

namespace Tests\Feature\Import;

use App\Actions\Import\ParseShaarliDatastore;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ParseShaarliDatastoreTest extends TestCase
{
    public function test_parses_datastore_content(): void
    {
        // Create data that mimics what unserialize produces from Shaarli's format
        $content = $this->createTestDatastore([
            ['id' => 1, 'shortUrl' => 'abc123', 'url' => 'https://example.com/1', 'title' => 'Example 1', 'description' => 'Description 1'],
            ['id' => 2, 'shortUrl' => 'def456', 'url' => 'https://example.com/2', 'title' => 'Example 2', 'description' => ''],
        ]);

        $file = UploadedFile::fake()->createWithContent('datastore.php', $content);

        $parser = new ParseShaarliDatastore;
        $result = $parser->handle($file);

        $this->assertCount(2, $result);
        $this->assertEquals('https://example.com/1', $result[0]['url']);
        $this->assertEquals('Example 1', $result[0]['title']);
        $this->assertEquals('Description 1', $result[0]['description']);
        $this->assertEquals('abc123', $result[0]['shaarli_short_url']);
    }

    public function test_throws_on_invalid_format(): void
    {
        $file = UploadedFile::fake()->createWithContent('datastore.php', 'invalid content');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid datastore format');

        (new ParseShaarliDatastore)->handle($file);
    }

    public function test_throws_on_invalid_base64(): void
    {
        $file = UploadedFile::fake()->createWithContent('datastore.php', '<'.'?php /* not-valid-base64!!! */ ?'.'>');

        $this->expectException(\RuntimeException::class);

        (new ParseShaarliDatastore)->handle($file);
    }

    public function test_throws_on_missing_bookmarks(): void
    {
        // Create empty data without bookmarks
        $data = (object) [];
        $serialized = serialize($data);
        $compressed = gzdeflate($serialized);
        $encoded = base64_encode($compressed);
        $content = '<'.'?php /* '.$encoded.' */ ?'.'>';

        $file = UploadedFile::fake()->createWithContent('datastore.php', $content);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Could not find bookmarks');

        (new ParseShaarliDatastore)->handle($file);
    }

    public function test_skips_bookmarks_without_url(): void
    {
        $content = $this->createTestDatastore([
            ['id' => 1, 'shortUrl' => 'abc123', 'url' => 'https://example.com/1', 'title' => 'Valid', 'description' => ''],
            ['id' => 2, 'shortUrl' => 'def456', 'url' => '', 'title' => 'No URL', 'description' => ''],
        ]);

        $file = UploadedFile::fake()->createWithContent('datastore.php', $content);

        $result = (new ParseShaarliDatastore)->handle($file);

        $this->assertCount(1, $result);
        $this->assertEquals('https://example.com/1', $result[0]['url']);
    }

    /**
     * Create a test datastore file content.
     *
     * This uses raw serialization to create the protected property format
     * that Shaarli uses.
     */
    private function createTestDatastore(array $bookmarksData): string
    {
        // Build the serialized string manually to include protected properties
        $bookmarks = [];
        foreach ($bookmarksData as $data) {
            $bookmarks[] = $this->serializeBookmark($data);
        }

        // Build the outer object with protected bookmarks property
        $bookmarksStr = implode('', $bookmarks);
        $bookmarkCount = count($bookmarksData);

        // Format: O:8:"stdClass":1:{s:12:"\0*\0bookmarks";a:N:{...}}
        $outerSerialized = 'O:8:"stdClass":1:{s:12:"'."\0*\0".'bookmarks";a:'.$bookmarkCount.':{'.$bookmarksStr.'}}';

        $compressed = gzdeflate($outerSerialized);
        $encoded = base64_encode($compressed);

        return '<'.'?php /* '.$encoded.' */ ?'.'>';
    }

    private function serializeBookmark(array $data): string
    {
        $idx = $data['id'] - 1;
        $parts = [];

        // Each property is serialized with protected prefix
        $parts[] = 's:5:"'."\0*\0".'id";i:'.$data['id'].';';
        $parts[] = 's:11:"'."\0*\0".'shortUrl";s:'.strlen($data['shortUrl']).':"'.$data['shortUrl'].'";';
        $parts[] = 's:6:"'."\0*\0".'url";s:'.strlen($data['url']).':"'.$data['url'].'";';
        $parts[] = 's:8:"'."\0*\0".'title";s:'.strlen($data['title']).':"'.$data['title'].'";';
        $parts[] = 's:14:"'."\0*\0".'description";s:'.strlen($data['description']).':"'.$data['description'].'";';

        $content = implode('', $parts);

        return 'i:'.$idx.';O:8:"stdClass":5:{'.$content.'}';
    }
}

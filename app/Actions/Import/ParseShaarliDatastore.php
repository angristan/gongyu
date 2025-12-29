<?php

declare(strict_types=1);

namespace App\Actions\Import;

use Illuminate\Http\UploadedFile;
use Lorisleiva\Actions\Concerns\AsAction;

class ParseShaarliDatastore
{
    use AsAction;

    /**
     * Parse a Shaarli datastore.php file.
     *
     * The datastore wraps base64(gzdeflate(serialize(data))) in PHP comment syntax.
     *
     * @return array<array{url: string, title: string, description: ?string, shaarli_short_url: ?string, created_at: ?int, updated_at: ?int}>
     *
     * @throws \RuntimeException If the file cannot be parsed
     */
    public function handle(UploadedFile $file): array
    {
        $content = file_get_contents($file->getRealPath());

        if ($content === false) {
            throw new \RuntimeException('Could not read the datastore file.');
        }

        return $this->parseDatastoreContent($content);
    }

    /**
     * Parse datastore content string.
     *
     * @return array<array{url: string, title: string, description: ?string, shaarli_short_url: ?string, created_at: ?int, updated_at: ?int}>
     */
    public function parseDatastoreContent(string $content): array
    {
        // Strip PHP wrapper tags (opening PHP with comment, closing PHP tag)
        $prefix = '<'.'?php /* ';
        $suffix = ' */ ?'.'>';

        if (! str_starts_with($content, $prefix)) {
            throw new \RuntimeException('Invalid datastore format: missing PHP prefix.');
        }

        $content = substr($content, strlen($prefix));

        if (str_ends_with($content, $suffix)) {
            $content = substr($content, 0, -strlen($suffix));
        } elseif (str_ends_with($content, ' */')) {
            // Some versions might not have the closing PHP tag
            $content = substr($content, 0, -strlen(' */'));
        }

        // Base64 decode
        $decoded = base64_decode($content, true);
        if ($decoded === false) {
            throw new \RuntimeException('Invalid datastore format: base64 decode failed.');
        }

        // Decompress
        $decompressed = @gzinflate($decoded);
        if ($decompressed === false) {
            throw new \RuntimeException('Invalid datastore format: gzinflate failed.');
        }

        // Unserialize with allowed_classes disabled to prevent PHP object injection
        // This converts objects to __PHP_Incomplete_Class which we handle in extractBookmarks()
        $data = @unserialize($decompressed, ['allowed_classes' => false]);
        if ($data === false) {
            throw new \RuntimeException('Invalid datastore format: unserialize failed.');
        }

        return $this->extractBookmarks($data);
    }

    /**
     * Extract bookmarks from the unserialized data structure.
     *
     * @return array<array{url: string, title: string, description: ?string, shaarli_short_url: ?string, created_at: ?int, updated_at: ?int}>
     */
    private function extractBookmarks(mixed $data): array
    {
        $bookmarks = [];

        // The data is a BookmarkArray object (incomplete class when unserialized outside Shaarli)
        // We need to access it as an array and find the bookmarks property
        $dataArray = (array) $data;

        // Find the bookmarks array (key contains "*bookmarks" due to protected property)
        $bookmarksArray = null;
        foreach ($dataArray as $key => $value) {
            $cleanKey = str_replace("\0", '', $key);
            if ($cleanKey === '*bookmarks' && is_array($value)) {
                $bookmarksArray = $value;
                break;
            }
        }

        if ($bookmarksArray === null) {
            throw new \RuntimeException('Could not find bookmarks in datastore.');
        }

        foreach ($bookmarksArray as $bookmark) {
            $parsed = $this->parseBookmark($bookmark);
            if ($parsed !== null) {
                $bookmarks[] = $parsed;
            }
        }

        return $bookmarks;
    }

    /**
     * Parse a single bookmark object.
     *
     * @return array{url: string, title: string, description: ?string, shaarli_short_url: ?string, created_at: ?int, updated_at: ?int}|null
     */
    private function parseBookmark(mixed $bookmark): ?array
    {
        $bookmarkArray = (array) $bookmark;

        $url = null;
        $title = null;
        $description = null;
        $shortUrl = null;
        $created = null;
        $updated = null;

        foreach ($bookmarkArray as $key => $value) {
            // Remove null bytes from protected property names
            $cleanKey = str_replace("\0", '', $key);

            // Match both formats: "*propertyName" and "Shaarli\Bookmark\BookmarkpropertyName"
            if ($cleanKey === '*url' || str_ends_with($cleanKey, 'url')) {
                if (is_string($value) && ! str_contains($cleanKey, 'short')) {
                    $url = $value;
                }
            }

            if ($cleanKey === '*shortUrl' || str_ends_with($cleanKey, 'shortUrl')) {
                $shortUrl = $value;
            }

            if ($cleanKey === '*title' || str_ends_with($cleanKey, 'title')) {
                $title = $value;
            }

            if ($cleanKey === '*description' || str_ends_with($cleanKey, 'description')) {
                $description = $value;
            }

            if ($cleanKey === '*created' || str_ends_with($cleanKey, 'created')) {
                $created = $this->extractTimestamp($value);
            }

            if ($cleanKey === '*updated' || str_ends_with($cleanKey, 'updated')) {
                $updated = $this->extractTimestamp($value);
            }
        }

        // Skip bookmarks without URL (shouldn't happen but be safe)
        if (! $url) {
            return null;
        }

        return [
            'url' => $url,
            'title' => $title ?? $url,
            'description' => $description ?: null,
            'shaarli_short_url' => $shortUrl,
            'created_at' => $created,
            'updated_at' => $updated,
        ];
    }

    /**
     * Extract Unix timestamp from a DateTime object or __PHP_Incomplete_Class.
     */
    private function extractTimestamp(mixed $value): ?int
    {
        if ($value === null) {
            return null;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->getTimestamp();
        }

        // Handle __PHP_Incomplete_Class DateTime objects
        if (is_object($value)) {
            $arr = (array) $value;
            foreach ($arr as $key => $val) {
                $cleanKey = str_replace("\0", '', $key);
                if ($cleanKey === 'date' && is_string($val)) {
                    try {
                        return (new \DateTime($val))->getTimestamp();
                    } catch (\Exception) {
                        return null;
                    }
                }
            }
        }

        return null;
    }
}

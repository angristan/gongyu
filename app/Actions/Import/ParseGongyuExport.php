<?php

declare(strict_types=1);

namespace App\Actions\Import;

use Illuminate\Http\UploadedFile;
use Lorisleiva\Actions\Concerns\AsAction;

class ParseGongyuExport
{
    use AsAction;

    /**
     * Parse a Gongyu JSON export file.
     *
     * @return array<array{url: string, title: string, description: ?string, short_url: ?string, shaarli_short_url: ?string, thumbnail_url: ?string, created_at: ?string, updated_at: ?string}>
     *
     * @throws \RuntimeException If the file cannot be parsed
     */
    public function handle(UploadedFile $file): array
    {
        $content = file_get_contents($file->getRealPath());

        if ($content === false) {
            throw new \RuntimeException('Could not read the export file.');
        }

        $data = json_decode($content, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('Invalid JSON format: '.json_last_error_msg());
        }

        if (! isset($data['bookmarks']) || ! is_array($data['bookmarks'])) {
            throw new \RuntimeException('Invalid Gongyu export format: missing bookmarks array.');
        }

        $bookmarks = [];
        foreach ($data['bookmarks'] as $item) {
            $url = $item['url'] ?? null;
            if (! $url) {
                continue;
            }

            $bookmarks[] = [
                'url' => $url,
                'title' => $item['title'] ?? $url,
                'description' => $item['description'] ?? null,
                'short_url' => $item['short_url'] ?? null,
                'shaarli_short_url' => $item['shaarli_short_url'] ?? null,
                'thumbnail_url' => $item['thumbnail_url'] ?? null,
                'created_at' => $item['created_at'] ?? null,
                'updated_at' => $item['updated_at'] ?? null,
            ];
        }

        return $bookmarks;
    }
}

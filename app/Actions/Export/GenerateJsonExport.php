<?php

declare(strict_types=1);

namespace App\Actions\Export;

use App\Models\Bookmark;
use Lorisleiva\Actions\Concerns\AsAction;

class GenerateJsonExport
{
    use AsAction;

    /**
     * Generate a JSON export of all bookmarks.
     *
     * This format is ideal for backup and migration purposes.
     */
    public function handle(): string
    {
        $bookmarks = Bookmark::orderBy('created_at', 'desc')->get();

        $data = [
            'exported_at' => now()->toIso8601String(),
            'version' => '1.0',
            'count' => $bookmarks->count(),
            'bookmarks' => $bookmarks->map(fn (Bookmark $bookmark) => [
                'id' => $bookmark->id,
                'url' => $bookmark->url,
                'title' => $bookmark->title,
                'description' => $bookmark->description,
                'short_url' => $bookmark->short_url,
                'shaarli_short_url' => $bookmark->shaarli_short_url,
                'thumbnail_url' => $bookmark->thumbnail_url,
                'created_at' => $bookmark->created_at?->toIso8601String(),
                'updated_at' => $bookmark->updated_at?->toIso8601String(),
            ])->all(),
        ];

        return json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}

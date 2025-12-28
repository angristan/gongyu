<?php

declare(strict_types=1);

namespace App\Actions\Import;

use App\Models\Bookmark;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Lorisleiva\Actions\Concerns\AsAction;

class BookmarkImporter
{
    use AsAction;

    /**
     * Import bookmarks from a normalized array.
     *
     * Each bookmark should have:
     * - url: string (required, but validated)
     * - title: string (required, but validated)
     * - description: ?string
     * - shaarli_short_url: ?string
     * - created_at: ?Carbon|?int (timestamp)
     * - updated_at: ?Carbon|?int (timestamp)
     *
     * @param  array<array{url?: string, title?: string, description?: ?string, shaarli_short_url?: ?string, created_at?: mixed, updated_at?: mixed}>  $bookmarks
     * @return array{imported: int, skipped: int, errors: array<string>}
     */
    public function handle(array $bookmarks): array
    {
        $result = [
            'imported' => 0,
            'skipped' => 0,
            'errors' => [],
        ];

        if (empty($bookmarks)) {
            return $result;
        }

        // Get URLs for duplicate check
        $urls = array_column($bookmarks, 'url');

        // Skip duplicate check if no bookmarks exist (fresh import)
        $existingUrls = [];
        if (Bookmark::exists()) {
            $existingUrls = Bookmark::whereIn('url', $urls)
                ->pluck('url')
                ->flip()
                ->toArray();
        }

        $toInsert = [];
        $seenUrls = [];

        foreach ($bookmarks as $item) {
            $url = $item['url'] ?? null;

            if (! $url) {
                $result['errors'][] = 'Bookmark missing URL: '.($item['title'] ?? 'unknown');

                continue;
            }

            // Skip if already in DB or already seen in this import
            if (isset($existingUrls[$url]) || isset($seenUrls[$url])) {
                $result['skipped']++;

                continue;
            }

            $seenUrls[$url] = true;

            $createdAt = $this->normalizeTimestamp($item['created_at'] ?? null);
            $updatedAt = $this->normalizeTimestamp($item['updated_at'] ?? null);

            $toInsert[] = [
                'short_url' => Str::random(8),
                'url' => $url,
                'title' => $item['title'] ?? $url,
                'description' => $item['description'] ?? null,
                'shaarli_short_url' => $item['shaarli_short_url'] ?? null,
                'created_at' => $createdAt,
                'updated_at' => $updatedAt,
            ];
            $result['imported']++;
        }

        // Bulk insert in chunks of 500
        if (! empty($toInsert)) {
            DB::transaction(function () use ($toInsert): void {
                foreach (array_chunk($toInsert, 500) as $chunk) {
                    Bookmark::insert($chunk);
                }
            });

            // Rebuild FTS index after import
            $this->rebuildSearchIndex();
        }

        return $result;
    }

    /**
     * Normalize a timestamp to a Carbon instance.
     */
    private function normalizeTimestamp(mixed $timestamp): Carbon
    {
        if ($timestamp === null) {
            return now();
        }

        if ($timestamp instanceof Carbon) {
            return $timestamp;
        }

        if ($timestamp instanceof \DateTimeInterface) {
            return Carbon::instance($timestamp);
        }

        if (is_numeric($timestamp)) {
            return Carbon::createFromTimestamp((int) $timestamp);
        }

        if (is_string($timestamp)) {
            try {
                return Carbon::parse($timestamp);
            } catch (\Exception) {
                return now();
            }
        }

        return now();
    }

    private function rebuildSearchIndex(): void
    {
        $driver = DB::connection()->getDriverName();

        try {
            // PostgreSQL uses triggers to auto-update search_vector on INSERT - no rebuild needed
            if ($driver === 'sqlite') {
                DB::statement("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
            }
        } catch (\Exception) {
            // Silently fail - search index rebuild is not critical
        }
    }
}

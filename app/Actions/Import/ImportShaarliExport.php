<?php

declare(strict_types=1);

namespace App\Actions\Import;

use App\Models\Bookmark;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Lorisleiva\Actions\Concerns\AsAction;

class ImportShaarliExport
{
    use AsAction;

    /**
     * Import bookmarks from a Shaarli HTML export.
     *
     * @return array{imported: int, skipped: int, errors: array<string>}
     */
    public function handle(UploadedFile $file): array
    {
        $result = [
            'imported' => 0,
            'skipped' => 0,
            'errors' => [],
        ];

        $html = file_get_contents($file->getRealPath());
        if ($html === false) {
            $result['errors'][] = 'Could not read the uploaded file.';

            return $result;
        }

        $parsed = ParseNetscapeBookmarks::run($html);

        // Skip duplicate check if no bookmarks exist (fresh import)
        $existingUrls = [];
        if (Bookmark::exists()) {
            $existingUrls = Bookmark::whereIn('url', array_column($parsed, 'url'))
                ->pluck('url')
                ->flip()
                ->toArray();
        }

        $toInsert = [];

        foreach ($parsed as $item) {
            if (isset($existingUrls[$item['url']])) {
                $result['skipped']++;

                continue;
            }

            $createdAt = $item['timestamp']
                ? Carbon::createFromTimestamp($item['timestamp'])
                : now();

            $toInsert[] = [
                'short_url' => Str::random(8),
                'url' => $item['url'],
                'title' => $item['title'],
                'description' => $item['description'] ?: null,
                'shaarli_short_url' => $item['shaarli_hash'],
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ];
            $result['imported']++;
        }

        // Bulk insert in chunks of 500
        DB::transaction(function () use ($toInsert): void {
            foreach (array_chunk($toInsert, 500) as $chunk) {
                Bookmark::insert($chunk);
            }
        });

        // Rebuild FTS index after import
        $this->rebuildSearchIndex();

        return $result;
    }

    private function rebuildSearchIndex(): void
    {
        $driver = DB::connection()->getDriverName();

        try {
            // PostgreSQL uses triggers to auto-update search_vector on INSERT - no rebuild needed
            if ($driver === 'sqlite') {
                DB::statement("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
            }
        } catch (\Exception $e) {
            // Silently fail - search index rebuild is not critical
        }
    }

    public function asController(Request $request): Response|RedirectResponse
    {
        if ($request->isMethod('GET')) {
            return Inertia::render('Admin/Import');
        }

        $request->validate([
            'file' => 'required|file|mimes:html,htm|max:10240', // 10MB max
        ]);

        $result = $this->handle($request->file('file'));

        return Inertia::render('Admin/Import', [
            'result' => $result,
        ]);
    }
}

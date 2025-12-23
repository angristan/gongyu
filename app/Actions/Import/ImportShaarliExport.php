<?php

declare(strict_types=1);

namespace App\Actions\Import;

use App\Models\Bookmark;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
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

        foreach ($parsed as $item) {
            try {
                // Check if bookmark already exists by URL
                $existing = Bookmark::where('url', $item['url'])->first();

                if ($existing) {
                    // Update shaarli_short_url if not set and we have it
                    if (empty($existing->shaarli_short_url) && ! empty($item['shaarli_hash'])) {
                        $existing->update(['shaarli_short_url' => $item['shaarli_hash']]);
                    }
                    $result['skipped']++;

                    continue;
                }

                // Create new bookmark
                $createdAt = $item['timestamp']
                    ? Carbon::createFromTimestamp($item['timestamp'])
                    : now();

                $bookmark = new Bookmark([
                    'url' => $item['url'],
                    'title' => $item['title'],
                    'description' => $item['description'] ?: null,
                    'shaarli_short_url' => $item['shaarli_hash'],
                ]);
                $bookmark->created_at = $createdAt;
                $bookmark->updated_at = $createdAt;
                $bookmark->save();

                $result['imported']++;
            } catch (\Exception $e) {
                $result['errors'][] = "Error importing {$item['url']}: {$e->getMessage()}";
            }
        }

        // Rebuild FTS index after import
        $this->rebuildSearchIndex();

        return $result;
    }

    private function rebuildSearchIndex(): void
    {
        $driver = DB::connection()->getDriverName();

        try {
            if ($driver === 'sqlite') {
                DB::statement("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
            } elseif ($driver === 'pgsql') {
                // PostgreSQL tsvector is updated via triggers, but force refresh
                DB::statement('UPDATE bookmarks SET search_vector = to_tsvector(\'english\', coalesce(title, \'\') || \' \' || coalesce(description, \'\') || \' \' || coalesce(url, \'\'))');
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

<?php

declare(strict_types=1);

namespace App\Actions\Import;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
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
        $html = file_get_contents($file->getRealPath());
        if ($html === false) {
            return [
                'imported' => 0,
                'skipped' => 0,
                'errors' => ['Could not read the uploaded file.'],
            ];
        }

        $parsed = ParseNetscapeBookmarks::run($html);

        // Normalize HTML parser output to BookmarkImporter format
        $bookmarks = array_map(fn ($item) => [
            'url' => $item['url'],
            'title' => $item['title'],
            'description' => $item['description'] ?: null,
            'shaarli_short_url' => $item['shaarli_hash'],
            'created_at' => $item['timestamp'],
            'updated_at' => $item['timestamp'],
        ], $parsed);

        return BookmarkImporter::run($bookmarks);
    }

    /**
     * Import bookmarks from a Shaarli datastore.php file.
     *
     * @return array{imported: int, skipped: int, errors: array<string>}
     */
    public function handleDatastore(UploadedFile $file): array
    {
        try {
            $bookmarks = ParseShaarliDatastore::run($file);

            return BookmarkImporter::run($bookmarks);
        } catch (\RuntimeException $e) {
            return [
                'imported' => 0,
                'skipped' => 0,
                'errors' => [$e->getMessage()],
            ];
        }
    }

    /**
     * Import bookmarks from a Shaarli API.
     *
     * @return array{imported: int, skipped: int, errors: array<string>}
     */
    public function handleApi(string $shaarliUrl, string $apiSecret): array
    {
        try {
            $bookmarks = ShaarliApiClient::run($shaarliUrl, $apiSecret);

            return BookmarkImporter::run($bookmarks);
        } catch (\RuntimeException $e) {
            return [
                'imported' => 0,
                'skipped' => 0,
                'errors' => [$e->getMessage()],
            ];
        }
    }

    /**
     * Import bookmarks from a Gongyu JSON export.
     *
     * @return array{imported: int, skipped: int, errors: array<string>}
     */
    public function handleGongyu(UploadedFile $file): array
    {
        try {
            $bookmarks = ParseGongyuExport::run($file);

            return BookmarkImporter::run($bookmarks);
        } catch (\RuntimeException $e) {
            return [
                'imported' => 0,
                'skipped' => 0,
                'errors' => [$e->getMessage()],
            ];
        }
    }

    public function asController(Request $request): RedirectResponse
    {
        if ($request->isMethod('GET')) {
            return redirect()->route('admin.settings', ['tab' => 'import']);
        }

        $importType = $request->input('import_type', 'html');

        $result = match ($importType) {
            'datastore' => $this->handleDatastoreRequest($request),
            'api' => $this->handleApiRequest($request),
            'gongyu' => $this->handleGongyuRequest($request),
            default => $this->handleHtmlRequest($request),
        };

        return redirect()
            ->route('admin.settings', ['tab' => 'import'])
            ->with('importResult', $result);
    }

    /**
     * @return array{imported: int, skipped: int, errors: array<string>}
     */
    private function handleHtmlRequest(Request $request): array
    {
        $request->validate([
            'file' => 'required|file|mimes:html,htm|max:10240', // 10MB max
        ]);

        return $this->handle($request->file('file'));
    }

    /**
     * @return array{imported: int, skipped: int, errors: array<string>}
     */
    private function handleDatastoreRequest(Request $request): array
    {
        $request->validate([
            'file' => 'required|file|max:10240', // 10MB max
        ]);

        return $this->handleDatastore($request->file('file'));
    }

    /**
     * @return array{imported: int, skipped: int, errors: array<string>}
     */
    private function handleApiRequest(Request $request): array
    {
        $request->validate([
            'shaarli_url' => 'required|url',
            'api_secret' => 'required|string|min:12',
        ]);

        return $this->handleApi(
            $request->input('shaarli_url'),
            $request->input('api_secret')
        );
    }

    /**
     * @return array{imported: int, skipped: int, errors: array<string>}
     */
    private function handleGongyuRequest(Request $request): array
    {
        $request->validate([
            'file' => 'required|file|mimes:json|max:10240', // 10MB max
        ]);

        return $this->handleGongyu($request->file('file'));
    }
}

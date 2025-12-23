<?php

declare(strict_types=1);

namespace App\Actions\Bookmark;

use App\Actions\Social\ShareBookmark;
use App\Actions\Thumbnail\GenerateThumbnail;
use App\Models\Bookmark;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Lorisleiva\Actions\Concerns\AsAction;

class CreateBookmark
{
    use AsAction;

    public function handle(array $data, bool $shareSocial = false): Bookmark
    {
        $bookmark = Bookmark::create([
            'url' => $data['url'],
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
        ]);

        // Generate thumbnail asynchronously (fire and forget)
        try {
            $thumbnailUrl = GenerateThumbnail::run($bookmark);
            if ($thumbnailUrl) {
                $bookmark->update(['thumbnail_url' => $thumbnailUrl]);
            }
        } catch (\Exception $e) {
            // Ignore thumbnail errors
        }

        // Share to social media if requested
        if ($shareSocial) {
            ShareBookmark::run($bookmark);
        }

        return $bookmark;
    }

    public function asController(Request $request)
    {
        if ($request->isMethod('GET')) {
            // Check if URL already exists
            $existingBookmark = null;
            if ($request->has('url')) {
                $existingBookmark = Bookmark::where('url', $request->input('url'))->first();
            }

            return Inertia::render('Admin/Bookmarks/Create', [
                'existingBookmark' => $existingBookmark,
                'prefill' => [
                    'url' => $request->input('url', ''),
                    'title' => $request->input('title', ''),
                    'description' => $request->input('description', ''),
                ],
            ]);
        }

        $validated = $request->validate([
            'url' => 'required|url|max:2048|unique:bookmarks,url',
            'title' => 'required|string|max:500',
            'description' => 'nullable|string',
            'share_social' => 'boolean',
        ]);

        $shareSocial = $validated['share_social'] ?? false;
        unset($validated['share_social']);

        $this->handle($validated, $shareSocial);

        return redirect()->route('admin.bookmarks.index')
            ->with('success', 'Bookmark created successfully.');
    }

    public static function rules(): array
    {
        return [
            'url' => 'required|url|max:2048|unique:bookmarks,url',
            'title' => 'required|string|max:500',
            'description' => 'nullable|string',
        ];
    }
}

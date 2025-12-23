<?php

declare(strict_types=1);

namespace App\Actions\Bookmark;

use App\Models\Bookmark;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Lorisleiva\Actions\Concerns\AsAction;

class UpdateBookmark
{
    use AsAction;

    public function handle(Bookmark $bookmark, array $data): Bookmark
    {
        $bookmark->update([
            'url' => $data['url'],
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
        ]);

        return $bookmark->fresh();
    }

    public function asController(Request $request, Bookmark $bookmark)
    {
        if ($request->isMethod('GET')) {
            return Inertia::render('Admin/Bookmarks/Edit', [
                'bookmark' => $bookmark,
            ]);
        }

        $validated = $request->validate([
            'url' => 'required|url|max:2048|unique:bookmarks,url,'.$bookmark->id,
            'title' => 'required|string|max:500',
            'description' => 'nullable|string',
        ]);

        $this->handle($bookmark, $validated);

        return redirect()->route('admin.bookmarks.index')
            ->with('success', 'Bookmark updated successfully.');
    }
}

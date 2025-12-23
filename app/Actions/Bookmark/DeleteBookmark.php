<?php

declare(strict_types=1);

namespace App\Actions\Bookmark;

use App\Models\Bookmark;
use Illuminate\Http\Request;
use Lorisleiva\Actions\Concerns\AsAction;

class DeleteBookmark
{
    use AsAction;

    public function handle(Bookmark $bookmark): bool
    {
        return $bookmark->delete();
    }

    public function asController(Request $request, Bookmark $bookmark)
    {
        $this->handle($bookmark);

        return redirect()->route('admin.bookmarks.index')
            ->with('success', 'Bookmark deleted successfully.');
    }
}

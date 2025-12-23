<?php

declare(strict_types=1);

namespace App\Actions\Public;

use App\Actions\Search\SearchBookmarks;
use App\Models\Bookmark;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Lorisleiva\Actions\Concerns\AsAction;

class ShowPublicBookmarks
{
    use AsAction;

    public function handle(?string $search = null, int $perPage = 20)
    {
        if ($search) {
            return SearchBookmarks::run($search, $perPage);
        }

        return Bookmark::query()
            ->orderByDesc('created_at')
            ->paginate($perPage);
    }

    public function asController(Request $request)
    {
        $search = $request->input('q');
        $bookmarks = $this->handle($search);

        return Inertia::render('Public/Index', [
            'bookmarks' => $bookmarks,
            'search' => $search,
        ]);
    }
}

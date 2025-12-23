<?php

declare(strict_types=1);

namespace App\Actions\Public;

use App\Models\Bookmark;
use Inertia\Inertia;
use Lorisleiva\Actions\Concerns\AsAction;

class ShowBookmarkByShortUrl
{
    use AsAction;

    public function handle(string $shortUrl): ?Bookmark
    {
        return Bookmark::where('short_url', $shortUrl)->first();
    }

    public function asController(string $shortUrl)
    {
        $bookmark = $this->handle($shortUrl);

        if (! $bookmark) {
            abort(404);
        }

        return Inertia::render('Public/Bookmark', [
            'bookmark' => $bookmark,
        ]);
    }
}

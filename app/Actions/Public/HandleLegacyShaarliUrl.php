<?php

declare(strict_types=1);

namespace App\Actions\Public;

use App\Models\Bookmark;
use Lorisleiva\Actions\Concerns\AsAction;

class HandleLegacyShaarliUrl
{
    use AsAction;

    public function handle(string $hash): ?Bookmark
    {
        return Bookmark::where('shaarli_short_url', $hash)->first();
    }

    public function asController(string $hash)
    {
        $bookmark = $this->handle($hash);

        if (! $bookmark) {
            abort(404);
        }

        return redirect()->route('bookmark.show', $bookmark->short_url, 301);
    }
}

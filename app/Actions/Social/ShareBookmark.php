<?php

declare(strict_types=1);

namespace App\Actions\Social;

use App\Models\Bookmark;
use Illuminate\Support\Facades\Log;
use Lorisleiva\Actions\Concerns\AsAction;

class ShareBookmark
{
    use AsAction;

    /**
     * Share a bookmark to all configured social media platforms.
     * Fire and forget - errors are logged but not thrown.
     */
    public function handle(Bookmark $bookmark): void
    {
        Log::info('Sharing bookmark to social media', ['bookmark_id' => $bookmark->id]);

        // Post to each platform (fire and forget)
        PostToTwitter::run($bookmark);
        PostToMastodon::run($bookmark);
        PostToBluesky::run($bookmark);
    }
}

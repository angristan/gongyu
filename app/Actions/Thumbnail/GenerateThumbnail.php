<?php

declare(strict_types=1);

namespace App\Actions\Thumbnail;

use App\Actions\Bookmark\FetchUrlMetadata;
use App\Models\Bookmark;
use Lorisleiva\Actions\Concerns\AsAction;

class GenerateThumbnail
{
    use AsAction;

    /**
     * Get the thumbnail URL for a bookmark by fetching its Open Graph image.
     */
    public function handle(Bookmark $bookmark): ?string
    {
        // Fetch metadata including og:image
        $metadata = FetchUrlMetadata::run($bookmark->url);

        if (empty($metadata['og_image'])) {
            return null;
        }

        $imageUrl = $metadata['og_image'];

        // Make sure it's an absolute URL
        if (! str_starts_with($imageUrl, 'http')) {
            $parsed = parse_url($bookmark->url);
            $baseUrl = ($parsed['scheme'] ?? 'https').'://'.($parsed['host'] ?? '');

            if (str_starts_with($imageUrl, '//')) {
                $imageUrl = ($parsed['scheme'] ?? 'https').':'.$imageUrl;
            } elseif (str_starts_with($imageUrl, '/')) {
                $imageUrl = $baseUrl.$imageUrl;
            } else {
                $imageUrl = $baseUrl.'/'.$imageUrl;
            }
        }

        return $imageUrl;
    }

    /**
     * Generate thumbnails for all bookmarks without one.
     */
    public function generateMissing(): int
    {
        $count = 0;

        Bookmark::whereNull('thumbnail_url')
            ->orWhere('thumbnail_url', '')
            ->chunk(50, function ($bookmarks) use (&$count) {
                foreach ($bookmarks as $bookmark) {
                    $thumbnailUrl = $this->handle($bookmark);
                    if ($thumbnailUrl) {
                        $bookmark->update(['thumbnail_url' => $thumbnailUrl]);
                        $count++;
                    }
                }
            });

        return $count;
    }
}

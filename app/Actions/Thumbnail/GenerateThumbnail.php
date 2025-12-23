<?php

declare(strict_types=1);

namespace App\Actions\Thumbnail;

use App\Actions\Bookmark\FetchUrlMetadata;
use App\Models\Bookmark;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Lorisleiva\Actions\Concerns\AsAction;

class GenerateThumbnail
{
    use AsAction;

    /**
     * Generate a thumbnail for a bookmark by fetching its Open Graph image.
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

        // Try to download and store the image
        try {
            $response = Http::timeout(15)
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (compatible; Gongyu/1.0)',
                ])
                ->get($imageUrl);

            if (! $response->successful()) {
                // Fall back to using the original URL
                return $imageUrl;
            }

            // Get content type
            $contentType = $response->header('Content-Type');
            if (! $contentType || ! str_starts_with($contentType, 'image/')) {
                return $imageUrl;
            }

            // Determine extension
            $extension = match (true) {
                str_contains($contentType, 'jpeg'), str_contains($contentType, 'jpg') => 'jpg',
                str_contains($contentType, 'png') => 'png',
                str_contains($contentType, 'gif') => 'gif',
                str_contains($contentType, 'webp') => 'webp',
                default => 'jpg',
            };

            // Generate filename
            $filename = 'thumbnails/'.$bookmark->short_url.'.'.$extension;

            // Store the image
            Storage::disk('public')->put($filename, $response->body());

            // Return the public URL
            return Storage::disk('public')->url($filename);

        } catch (\Exception $e) {
            // On any error, return the original OG image URL
            return $imageUrl;
        }
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

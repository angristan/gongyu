<?php

declare(strict_types=1);

namespace App\Actions\Social;

use App\Models\Bookmark;
use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Lorisleiva\Actions\Concerns\AsAction;

class PostToBluesky
{
    use AsAction;

    /**
     * Post a bookmark to Bluesky (AT Protocol).
     */
    public function handle(Bookmark $bookmark): bool
    {
        $handle = Setting::get('bluesky_handle');
        $appPassword = Setting::get('bluesky_app_password');

        if (! $handle || ! $appPassword) {
            Log::debug('Bluesky credentials not configured');

            return false;
        }

        try {
            // Create session (login)
            $session = $this->createSession($handle, $appPassword);
            if (! $session) {
                return false;
            }

            $text = $this->formatPost($bookmark);
            $url = $bookmark->url;

            // Create the post with link card
            $record = [
                '$type' => 'app.bsky.feed.post',
                'text' => $text,
                'createdAt' => now()->toIso8601String(),
                'facets' => $this->createFacets($text, $url),
            ];

            // Add external embed for link preview card
            $record['embed'] = $this->createExternalEmbed($bookmark, $session['accessJwt']);

            $response = Http::withToken($session['accessJwt'])
                ->post('https://bsky.social/xrpc/com.atproto.repo.createRecord', [
                    'repo' => $session['did'],
                    'collection' => 'app.bsky.feed.post',
                    'record' => $record,
                ]);

            if ($response->successful()) {
                Log::info('Posted bookmark to Bluesky', ['bookmark_id' => $bookmark->id]);

                return true;
            }

            Log::warning('Failed to post to Bluesky', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return false;

        } catch (\Exception $e) {
            Log::error('Error posting to Bluesky', [
                'error' => $e->getMessage(),
                'bookmark_id' => $bookmark->id,
            ]);

            return false;
        }
    }

    private function createSession(string $handle, string $password): ?array
    {
        $response = Http::post('https://bsky.social/xrpc/com.atproto.server.createSession', [
            'identifier' => $handle,
            'password' => $password,
        ]);

        if ($response->successful()) {
            return $response->json();
        }

        Log::warning('Failed to create Bluesky session', [
            'status' => $response->status(),
            'body' => $response->body(),
        ]);

        return null;
    }

    private function formatPost(Bookmark $bookmark): string
    {
        $maxLength = 300;
        $url = $bookmark->url;

        $availableLength = $maxLength - mb_strlen($url) - 1; // -1 for space

        $title = $bookmark->title;
        if (mb_strlen($title) > $availableLength) {
            $title = mb_substr($title, 0, $availableLength - 1).'…';
        }

        return $title.' '.$url;
    }

    private function createFacets(string $text, string $url): array
    {
        $facets = [];

        // Find the URL position in the text
        $urlStart = mb_strpos($text, $url);
        if ($urlStart !== false) {
            $facets[] = [
                'index' => [
                    'byteStart' => strlen(mb_substr($text, 0, $urlStart)),
                    'byteEnd' => strlen(mb_substr($text, 0, $urlStart)) + strlen($url),
                ],
                'features' => [
                    [
                        '$type' => 'app.bsky.richtext.facet#link',
                        'uri' => $url,
                    ],
                ],
            ];
        }

        return $facets;
    }

    private function createExternalEmbed(Bookmark $bookmark, string $accessJwt): array
    {
        $external = [
            'uri' => $bookmark->url,
            'title' => $bookmark->title,
            'description' => $bookmark->description ?? '',
        ];

        // Upload thumbnail as blob if available
        if ($bookmark->thumbnail_url) {
            $thumb = $this->uploadThumbnailBlob($bookmark->thumbnail_url, $accessJwt);
            if ($thumb) {
                $external['thumb'] = $thumb;
            }
        }

        return [
            '$type' => 'app.bsky.embed.external',
            'external' => $external,
        ];
    }

    private function uploadThumbnailBlob(string $thumbnailUrl, string $accessJwt): ?array
    {
        try {
            // Fetch the thumbnail image
            $imageResponse = Http::timeout(10)->get($thumbnailUrl);
            if (! $imageResponse->successful()) {
                return null;
            }

            $imageData = $imageResponse->body();
            $contentType = $imageResponse->header('Content-Type') ?: 'image/jpeg';

            // Upload to Bluesky as a blob
            $uploadResponse = Http::withToken($accessJwt)
                ->withBody($imageData, $contentType)
                ->post('https://bsky.social/xrpc/com.atproto.repo.uploadBlob');

            if ($uploadResponse->successful()) {
                return $uploadResponse->json('blob');
            }

            Log::debug('Failed to upload thumbnail blob to Bluesky', [
                'status' => $uploadResponse->status(),
            ]);

        } catch (\Exception $e) {
            Log::debug('Error uploading thumbnail to Bluesky', [
                'error' => $e->getMessage(),
            ]);
        }

        return null;
    }
}

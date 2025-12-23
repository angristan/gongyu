<?php

declare(strict_types=1);

namespace App\Actions\Social;

use App\Models\Bookmark;
use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Lorisleiva\Actions\Concerns\AsAction;

class PostToMastodon
{
    use AsAction;

    /**
     * Post a bookmark to Mastodon.
     */
    public function handle(Bookmark $bookmark): bool
    {
        $instance = Setting::get('mastodon_instance');
        $accessToken = Setting::get('mastodon_access_token');

        if (! $instance || ! $accessToken) {
            Log::debug('Mastodon credentials not configured');

            return false;
        }

        // Normalize instance URL
        $instance = rtrim($instance, '/');
        if (! str_starts_with($instance, 'http')) {
            $instance = 'https://'.$instance;
        }

        $status = $this->formatStatus($bookmark);

        try {
            $response = Http::withToken($accessToken)
                ->post($instance.'/api/v1/statuses', [
                    'status' => $status,
                ]);

            if ($response->successful()) {
                Log::info('Posted bookmark to Mastodon', ['bookmark_id' => $bookmark->id]);

                return true;
            }

            Log::warning('Failed to post to Mastodon', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return false;

        } catch (\Exception $e) {
            Log::error('Error posting to Mastodon', [
                'error' => $e->getMessage(),
                'bookmark_id' => $bookmark->id,
            ]);

            return false;
        }
    }

    private function formatStatus(Bookmark $bookmark): string
    {
        $maxLength = 500;
        $url = url('/b/'.$bookmark->short_url);

        $availableLength = $maxLength - mb_strlen($url) - 1; // -1 for space

        $title = $bookmark->title;
        if (mb_strlen($title) > $availableLength) {
            $title = mb_substr($title, 0, $availableLength - 1).'…';
        }

        return $title.' '.$url;
    }
}

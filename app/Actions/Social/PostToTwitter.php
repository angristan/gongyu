<?php

declare(strict_types=1);

namespace App\Actions\Social;

use App\Models\Bookmark;
use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Lorisleiva\Actions\Concerns\AsAction;

class PostToTwitter
{
    use AsAction;

    /**
     * Post a bookmark to Twitter using API v2.
     */
    public function handle(Bookmark $bookmark): bool
    {
        $apiKey = Setting::get('twitter_api_key');
        $apiSecret = Setting::get('twitter_api_secret');
        $accessToken = Setting::get('twitter_access_token');
        $accessSecret = Setting::get('twitter_access_secret');

        if (! $apiKey || ! $apiSecret || ! $accessToken || ! $accessSecret) {
            Log::debug('Twitter credentials not configured');

            return false;
        }

        $text = $this->formatTweet($bookmark);

        try {
            // Generate OAuth 1.0a signature
            $url = 'https://api.twitter.com/2/tweets';
            $method = 'POST';

            $oauth = [
                'oauth_consumer_key' => $apiKey,
                'oauth_nonce' => bin2hex(random_bytes(16)),
                'oauth_signature_method' => 'HMAC-SHA1',
                'oauth_timestamp' => (string) time(),
                'oauth_token' => $accessToken,
                'oauth_version' => '1.0',
            ];

            $baseString = $this->buildBaseString($method, $url, $oauth);
            $signingKey = rawurlencode($apiSecret).'&'.rawurlencode($accessSecret);
            $oauth['oauth_signature'] = base64_encode(hash_hmac('sha1', $baseString, $signingKey, true));

            $authHeader = 'OAuth '.implode(', ', array_map(
                fn ($k, $v) => rawurlencode($k).'="'.rawurlencode($v).'"',
                array_keys($oauth),
                $oauth
            ));

            $response = Http::withHeaders([
                'Authorization' => $authHeader,
                'Content-Type' => 'application/json',
            ])->post($url, ['text' => $text]);

            if ($response->successful()) {
                Log::info('Posted bookmark to Twitter', ['bookmark_id' => $bookmark->id]);

                return true;
            }

            Log::warning('Failed to post to Twitter', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return false;

        } catch (\Exception $e) {
            Log::error('Error posting to Twitter', [
                'error' => $e->getMessage(),
                'bookmark_id' => $bookmark->id,
            ]);

            return false;
        }
    }

    private function formatTweet(Bookmark $bookmark): string
    {
        $maxLength = 280;
        $url = url('/b/'.$bookmark->short_url);
        $urlLength = 23; // Twitter counts all URLs as 23 chars

        $availableLength = $maxLength - $urlLength - 1; // -1 for space

        $title = $bookmark->title;
        if (mb_strlen($title) > $availableLength) {
            $title = mb_substr($title, 0, $availableLength - 1).'…';
        }

        return $title.' '.$url;
    }

    private function buildBaseString(string $method, string $url, array $params): string
    {
        ksort($params);
        $paramString = http_build_query($params, '', '&', PHP_QUERY_RFC3986);

        return strtoupper($method).'&'.rawurlencode($url).'&'.rawurlencode($paramString);
    }
}

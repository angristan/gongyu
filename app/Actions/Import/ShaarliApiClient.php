<?php

declare(strict_types=1);

namespace App\Actions\Import;

use Illuminate\Support\Facades\Http;
use Lorisleiva\Actions\Concerns\AsAction;

class ShaarliApiClient
{
    use AsAction;

    /**
     * Fetch all bookmarks from a Shaarli instance via its REST API.
     *
     * @return array<array{url: string, title: string, description: ?string, shaarli_short_url: ?string, created_at: ?string, updated_at: ?string}>
     *
     * @throws \RuntimeException If the API request fails
     */
    public function handle(string $baseUrl, string $apiSecret): array
    {
        $baseUrl = rtrim($baseUrl, '/');
        $jwt = $this->generateJwt($apiSecret);

        $response = Http::timeout(60)
            ->withHeaders([
                'Authorization' => 'Bearer '.$jwt,
                'Accept' => 'application/json',
            ])
            ->get($baseUrl.'/api/v1/links', [
                'limit' => 'all',
            ]);

        if (! $response->successful()) {
            $status = $response->status();
            $body = $response->body();

            if ($status === 401) {
                throw new \RuntimeException('Authentication failed. Please check your API secret.');
            }

            throw new \RuntimeException("API request failed with status {$status}: {$body}");
        }

        $data = $response->json();

        if (! is_array($data)) {
            throw new \RuntimeException('Invalid API response: expected array of bookmarks.');
        }

        return $this->normalizeBookmarks($data);
    }

    /**
     * Generate a JWT token for Shaarli API authentication.
     *
     * Shaarli expects:
     * - Header: {"typ": "JWT", "alg": "HS512"}
     * - Payload: {"iat": <unix_timestamp>}
     * - Signature: HMAC-SHA512 of header.payload with API secret
     */
    private function generateJwt(string $apiSecret): string
    {
        $header = $this->base64UrlEncode(json_encode([
            'typ' => 'JWT',
            'alg' => 'HS512',
        ]));

        $payload = $this->base64UrlEncode(json_encode([
            'iat' => time(),
        ]));

        $signature = $this->base64UrlEncode(
            hash_hmac('sha512', "{$header}.{$payload}", $apiSecret, true)
        );

        return "{$header}.{$payload}.{$signature}";
    }

    /**
     * Base64 URL-safe encoding (no padding, + becomes -, / becomes _).
     */
    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Normalize API response to standard bookmark format.
     *
     * @param  array<array<string, mixed>>  $bookmarks
     * @return array<array{url: string, title: string, description: ?string, shaarli_short_url: ?string, created_at: ?string, updated_at: ?string}>
     */
    private function normalizeBookmarks(array $bookmarks): array
    {
        $normalized = [];

        foreach ($bookmarks as $bookmark) {
            $url = $bookmark['url'] ?? null;

            if (! $url || ! is_string($url)) {
                continue;
            }

            $normalized[] = [
                'url' => $url,
                'title' => $bookmark['title'] ?? $url,
                'description' => $bookmark['description'] ?? null,
                'shaarli_short_url' => $bookmark['shorturl'] ?? null,
                'created_at' => $bookmark['created'] ?? null,
                'updated_at' => $bookmark['updated'] ?? null,
            ];
        }

        return $normalized;
    }
}

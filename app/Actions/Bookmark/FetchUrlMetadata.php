<?php

declare(strict_types=1);

namespace App\Actions\Bookmark;

use App\Actions\Title\CleanTitle;
use Illuminate\Support\Facades\Http;
use Lorisleiva\Actions\Concerns\AsAction;

class FetchUrlMetadata
{
    use AsAction;

    /**
     * Fetch metadata from a URL.
     *
     * @return array{title: string, description: string, og_image: string|null}
     */
    public function handle(string $url): array
    {
        $result = [
            'title' => '',
            'description' => '',
            'og_image' => null,
        ];

        try {
            $response = Http::timeout(10)
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (compatible; Gongyu/1.0)',
                ])
                ->get($url);

            if (! $response->successful()) {
                return $result;
            }

            $html = $response->body();

            // Extract title
            if (preg_match('/<title[^>]*>([^<]+)<\/title>/i', $html, $matches)) {
                $result['title'] = CleanTitle::run(html_entity_decode(trim($matches[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            }

            // Extract meta description
            if (preg_match('/<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i', $html, $matches)) {
                $result['description'] = html_entity_decode(trim($matches[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            } elseif (preg_match('/<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\'][^>]*>/i', $html, $matches)) {
                $result['description'] = html_entity_decode(trim($matches[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }

            // Extract Open Graph title (prefer over regular title if available)
            if (preg_match('/<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i', $html, $matches)) {
                $result['title'] = CleanTitle::run(html_entity_decode(trim($matches[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            } elseif (preg_match('/<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\'][^>]*>/i', $html, $matches)) {
                $result['title'] = CleanTitle::run(html_entity_decode(trim($matches[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            }

            // Extract Open Graph description
            if (preg_match('/<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i', $html, $matches)) {
                $result['description'] = html_entity_decode(trim($matches[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            } elseif (preg_match('/<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:description["\'][^>]*>/i', $html, $matches)) {
                $result['description'] = html_entity_decode(trim($matches[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }

            // Extract Open Graph image
            if (preg_match('/<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i', $html, $matches)) {
                $result['og_image'] = trim($matches[1]);
            } elseif (preg_match('/<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\'][^>]*>/i', $html, $matches)) {
                $result['og_image'] = trim($matches[1]);
            }

        } catch (\Exception $e) {
            // Return empty result on any error
        }

        return $result;
    }
}

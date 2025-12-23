<?php

declare(strict_types=1);

namespace App\Actions\Import;

use Lorisleiva\Actions\Concerns\AsAction;

class ParseNetscapeBookmarks
{
    use AsAction;

    /**
     * Parse a Netscape bookmark file (HTML format).
     *
     * @return array<array{url: string, title: string, description: string, timestamp: int|null, shaarli_hash: string|null}>
     */
    public function handle(string $html): array
    {
        $bookmarks = [];

        // Normalize line endings
        $html = str_replace(["\r\n", "\r"], "\n", $html);

        // Match all <A> tags with their attributes
        // Shaarli format: <A HREF="url" ADD_DATE="timestamp" PRIVATE="0">title</A>
        // Followed by optional <DD>description
        preg_match_all(
            '/<A\s+([^>]+)>([^<]*)<\/A>(?:\s*<DD>([^<\n]*))?/i',
            $html,
            $matches,
            PREG_SET_ORDER
        );

        foreach ($matches as $match) {
            $attributes = $this->parseAttributes($match[1]);
            $title = html_entity_decode(trim($match[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $description = isset($match[3]) ? html_entity_decode(trim($match[3]), ENT_QUOTES | ENT_HTML5, 'UTF-8') : '';

            $url = $attributes['href'] ?? null;
            if (! $url || ! filter_var($url, FILTER_VALIDATE_URL)) {
                continue;
            }

            // Extract Shaarli hash from URL if present (e.g., ?WDWyig)
            $shaarliHash = null;
            $parsedUrl = parse_url($url);
            if (isset($parsedUrl['query']) && preg_match('/^[a-zA-Z0-9_-]{6}$/', $parsedUrl['query'])) {
                $shaarliHash = $parsedUrl['query'];
            }

            // Also check for shaarli_hash in custom attributes
            if (empty($shaarliHash) && isset($attributes['tags'])) {
                // Some exports might have the hash somewhere
            }

            $bookmarks[] = [
                'url' => $url,
                'title' => $title ?: $url,
                'description' => $description,
                'timestamp' => isset($attributes['add_date']) ? (int) $attributes['add_date'] : null,
                'shaarli_hash' => $shaarliHash,
            ];
        }

        return $bookmarks;
    }

    /**
     * Parse HTML tag attributes into an associative array.
     */
    private function parseAttributes(string $attributeString): array
    {
        $attributes = [];

        // Match attribute="value" or attribute='value' or attribute=value
        preg_match_all(
            '/(\w+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|(\S+))/i',
            $attributeString,
            $matches,
            PREG_SET_ORDER
        );

        foreach ($matches as $match) {
            $name = strtolower($match[1]);
            $value = $match[2] ?? $match[3] ?? $match[4] ?? '';
            $attributes[$name] = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }

        return $attributes;
    }
}

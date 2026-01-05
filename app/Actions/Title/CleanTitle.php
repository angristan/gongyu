<?php

declare(strict_types=1);

namespace App\Actions\Title;

use Lorisleiva\Actions\Concerns\AsAction;

class CleanTitle
{
    use AsAction;

    /**
     * Common patterns for website suffixes in page titles.
     */
    private const PATTERNS = [
        // "Title | Site Name" or "Title — Site Name" or "Title – Site Name"
        '/\s*[\|\x{2013}\x{2014}]\s*[^|\x{2013}\x{2014}]+$/u',

        // "Title - Site Name" (require spaces around hyphen to avoid matching "in-place")
        '/\s+-\s+[^-]+$/u',

        // "Title · Site Name"
        '/\s*\x{00B7}\s*[^\x{00B7}]+$/u',
    ];

    /**
     * Known site suffixes to remove.
     */
    private const KNOWN_SUFFIXES = [
        'YouTube',
        'Wikipedia',
        'Reddit',
        'Twitter',
        'X',
        'GitHub',
        'Stack Overflow',
        'Medium',
        'The Verge',
        'Hacker News',
        'Ars Technica',
        'TechCrunch',
        'Wired',
        'BBC',
        'CNN',
        'The New York Times',
        'The Guardian',
        'The Washington Post',
        'Forbes',
        'Bloomberg',
    ];

    /**
     * Clean a page title by removing common website suffixes.
     */
    public function handle(string $title): string
    {
        $cleaned = trim($title);

        if (empty($cleaned)) {
            return $cleaned;
        }

        // Apply pattern-based cleaning
        foreach (self::PATTERNS as $pattern) {
            $cleaned = preg_replace($pattern, '', $cleaned);
        }

        // Remove known suffixes that might not be caught by patterns
        foreach (self::KNOWN_SUFFIXES as $suffix) {
            // Match at the end with various separators (including Unicode dashes)
            $cleaned = preg_replace('/\s*[\|\x{2013}\x{2014}\x{00B7}:-]\s*'.preg_quote($suffix, '/').'\s*$/iu', '', $cleaned);
        }

        // Clean up any remaining whitespace
        $cleaned = trim($cleaned);

        // If we cleaned too much (resulting in empty string), return original
        if (empty($cleaned)) {
            return trim($title);
        }

        return $cleaned;
    }
}

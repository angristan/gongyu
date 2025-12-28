<?php

declare(strict_types=1);

namespace App\Actions\Export;

use App\Models\Bookmark;
use Lorisleiva\Actions\Concerns\AsAction;

class GenerateNetscapeExport
{
    use AsAction;

    /**
     * Generate a Netscape bookmark file (HTML format).
     *
     * This format is compatible with browsers and Shaarli for re-import.
     */
    public function handle(): string
    {
        $bookmarks = Bookmark::orderBy('created_at', 'desc')->get();

        $date = now()->format('D, d M y H:i:s O');

        $html = <<<HTML
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<!-- This is an automatically generated file.
     It will be read and overwritten.
     Do Not Edit! -->
<TITLE>Bookmarks Export</TITLE>
<H1>Bookmarks export on {$date}</H1>
<DL><p>
HTML;

        foreach ($bookmarks as $bookmark) {
            $html .= $this->formatBookmark($bookmark);
        }

        $html .= "</DL><p>\n";

        return $html;
    }

    private function formatBookmark(Bookmark $bookmark): string
    {
        $url = htmlspecialchars($bookmark->url, ENT_QUOTES, 'UTF-8');
        $title = htmlspecialchars($bookmark->title, ENT_QUOTES, 'UTF-8');
        $addDate = $bookmark->created_at->timestamp;
        $shortUrl = htmlspecialchars($bookmark->short_url, ENT_QUOTES, 'UTF-8');

        $attributes = [
            "HREF=\"{$url}\"",
            "ADD_DATE=\"{$addDate}\"",
            "SHORTURL=\"{$shortUrl}\"",
        ];

        // Include Shaarli short URL if available (for legacy compatibility)
        if ($bookmark->shaarli_short_url) {
            $shaarliShortUrl = htmlspecialchars($bookmark->shaarli_short_url, ENT_QUOTES, 'UTF-8');
            $attributes[] = "SHAARLI_SHORTURL=\"{$shaarliShortUrl}\"";
        }

        if ($bookmark->updated_at && $bookmark->updated_at->ne($bookmark->created_at)) {
            $attributes[] = "LAST_MODIFIED=\"{$bookmark->updated_at->timestamp}\"";
        }

        $attrString = implode(' ', $attributes);
        $line = "<DT><A {$attrString}>{$title}</A>";

        // Add description if present
        if ($bookmark->description) {
            $description = htmlspecialchars($bookmark->description, ENT_QUOTES, 'UTF-8');
            $line .= "\n<DD>{$description}";
        }

        return $line."\n";
    }
}

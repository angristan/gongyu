<?php

declare(strict_types=1);

namespace App\Actions\Feed;

use App\Models\Bookmark;
use Illuminate\Http\Response;
use Lorisleiva\Actions\Concerns\AsAction;

class GenerateAtomFeed
{
    use AsAction;

    public function handle(int $limit = 50): array
    {
        return Bookmark::query()
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->toArray();
    }

    public function asController(): Response
    {
        $bookmarks = $this->handle();
        $siteUrl = config('app.url');
        $siteName = config('app.name', 'Gongyu');
        $updated = Bookmark::max('updated_at') ?? now()->toIso8601String();

        $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n";
        $xml .= '<feed xmlns="http://www.w3.org/2005/Atom">'."\n";
        $xml .= '  <title>'.htmlspecialchars($siteName).'</title>'."\n";
        $xml .= '  <link href="'.htmlspecialchars($siteUrl).'" rel="alternate"/>'."\n";
        $xml .= '  <link href="'.htmlspecialchars($siteUrl.'/feed').'" rel="self"/>'."\n";
        $xml .= '  <id>'.htmlspecialchars($siteUrl).'</id>'."\n";
        $xml .= '  <updated>'.htmlspecialchars($updated).'</updated>'."\n";

        foreach ($bookmarks as $bookmark) {
            $bookmarkUrl = $siteUrl.'/b/'.$bookmark['short_url'];
            $xml .= '  <entry>'."\n";
            $xml .= '    <title>'.htmlspecialchars($bookmark['title']).'</title>'."\n";
            $xml .= '    <link href="'.htmlspecialchars($bookmark['url']).'" rel="alternate"/>'."\n";
            $xml .= '    <link href="'.htmlspecialchars($bookmarkUrl).'" rel="via"/>'."\n";
            $xml .= '    <id>'.htmlspecialchars($bookmarkUrl).'</id>'."\n";
            $xml .= '    <updated>'.htmlspecialchars($bookmark['updated_at']).'</updated>'."\n";
            $xml .= '    <published>'.htmlspecialchars($bookmark['created_at']).'</published>'."\n";
            if (! empty($bookmark['description'])) {
                $xml .= '    <summary type="text">'.htmlspecialchars($bookmark['description']).'</summary>'."\n";
            }
            $xml .= '  </entry>'."\n";
        }

        $xml .= '</feed>';

        return response($xml, 200, [
            'Content-Type' => 'application/atom+xml; charset=UTF-8',
        ]);
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Export;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Lorisleiva\Actions\Concerns\AsAction;

class ExportBookmarks
{
    use AsAction;

    public function asController(Request $request): Response
    {
        $format = $request->input('format', 'html');

        [$content, $mimeType, $extension] = match ($format) {
            'json' => [
                GenerateJsonExport::run(),
                'application/json',
                'json',
            ],
            default => [
                GenerateNetscapeExport::run(),
                'text/html',
                'html',
            ],
        };

        $filename = 'bookmarks_'.date('Ymd_His').'.'.$extension;

        return response($content)
            ->header('Content-Type', $mimeType.'; charset=utf-8')
            ->header('Content-Disposition', "attachment; filename=\"{$filename}\"");
    }
}

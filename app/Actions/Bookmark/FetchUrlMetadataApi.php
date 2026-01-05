<?php

declare(strict_types=1);

namespace App\Actions\Bookmark;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Lorisleiva\Actions\Concerns\AsAction;

class FetchUrlMetadataApi
{
    use AsAction;

    public function asController(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => 'required|url|max:2048',
        ]);

        $metadata = FetchUrlMetadata::run($validated['url']);

        return response()->json($metadata);
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Settings;

use App\Models\Bookmark;
use App\Models\Setting;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Lorisleiva\Actions\Concerns\AsAction;

class ShowSettings
{
    use AsAction;

    private const SETTING_KEYS = [
        'twitter_api_key',
        'twitter_api_secret',
        'twitter_access_token',
        'twitter_access_secret',
        'mastodon_instance',
        'mastodon_access_token',
        'bluesky_handle',
        'bluesky_app_password',
    ];

    public function handle(?array $importResult = null, ?array $deleteResult = null): Response
    {
        $settings = [];
        foreach (self::SETTING_KEYS as $key) {
            $settings[$key] = Setting::get($key, '');
        }

        return Inertia::render('Admin/Settings/Index', [
            'settings' => $settings,
            'importResult' => $importResult,
            'deleteResult' => $deleteResult,
            'bookmarkCount' => Bookmark::count(),
        ]);
    }

    public function asController(Request $request): Response
    {
        return $this->handle(
            $request->session()->get('importResult'),
            $request->session()->get('deleteResult')
        );
    }
}

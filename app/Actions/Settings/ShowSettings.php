<?php

declare(strict_types=1);

namespace App\Actions\Settings;

use App\Models\Setting;
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

    public function handle(): Response
    {
        $settings = [];
        foreach (self::SETTING_KEYS as $key) {
            $settings[$key] = Setting::get($key, '');
        }

        return Inertia::render('Admin/Settings/Index', [
            'settings' => $settings,
            'bookmarkletUrl' => url('/bookmarklet'),
        ]);
    }

    public function asController(): Response
    {
        return $this->handle();
    }
}

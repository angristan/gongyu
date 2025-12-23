<?php

declare(strict_types=1);

namespace App\Actions\Settings;

use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Lorisleiva\Actions\Concerns\AsAction;

class UpdateSettings
{
    use AsAction;

    private const ENCRYPTED_KEYS = [
        'twitter_api_secret',
        'twitter_access_secret',
        'mastodon_access_token',
        'bluesky_app_password',
    ];

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

    public function handle(array $data): void
    {
        foreach (self::SETTING_KEYS as $key) {
            if (array_key_exists($key, $data)) {
                $encrypted = in_array($key, self::ENCRYPTED_KEYS, true);
                Setting::set($key, $data[$key] ?: null, $encrypted);
            }
        }
    }

    public function asController(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'twitter_api_key' => 'nullable|string|max:255',
            'twitter_api_secret' => 'nullable|string|max:255',
            'twitter_access_token' => 'nullable|string|max:255',
            'twitter_access_secret' => 'nullable|string|max:255',
            'mastodon_instance' => 'nullable|url|max:255',
            'mastodon_access_token' => 'nullable|string|max:255',
            'bluesky_handle' => 'nullable|string|max:255',
            'bluesky_app_password' => 'nullable|string|max:255',
        ]);

        $this->handle($validated);

        return redirect()->back()->with('success', 'Settings updated successfully.');
    }
}

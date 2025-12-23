<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class SettingTest extends TestCase
{
    use RefreshDatabase;

    public function test_set_and_get_plain_value(): void
    {
        Setting::set('test_key', 'test_value');

        $this->assertEquals('test_value', Setting::get('test_key'));
    }

    public function test_set_and_get_encrypted_value(): void
    {
        Setting::set('secret_key', 'secret_value', encrypted: true);

        // Value should be retrievable decrypted
        $this->assertEquals('secret_value', Setting::get('secret_key'));

        // Raw database value should be encrypted (not plain text)
        $raw = Setting::where('key', 'secret_key')->first()->getAttributes()['value'];
        $this->assertNotEquals('secret_value', $raw);
        $this->assertEquals('secret_value', Crypt::decryptString($raw));
    }

    public function test_get_returns_default_when_key_not_found(): void
    {
        $this->assertEquals('default', Setting::get('nonexistent', 'default'));
        $this->assertNull(Setting::get('nonexistent'));
    }

    public function test_set_null_value(): void
    {
        Setting::set('nullable_key', 'initial');
        Setting::set('nullable_key', null);

        $this->assertNull(Setting::get('nullable_key'));
    }

    public function test_update_plain_to_encrypted(): void
    {
        Setting::set('upgrade_key', 'plain_value');
        $this->assertEquals('plain_value', Setting::get('upgrade_key'));

        Setting::set('upgrade_key', 'now_encrypted', encrypted: true);
        $this->assertEquals('now_encrypted', Setting::get('upgrade_key'));

        // Verify it's actually encrypted in DB
        $raw = Setting::where('key', 'upgrade_key')->first()->getAttributes()['value'];
        $this->assertNotEquals('now_encrypted', $raw);
    }

    public function test_update_encrypted_value(): void
    {
        Setting::set('rotating_secret', 'first_secret', encrypted: true);
        $this->assertEquals('first_secret', Setting::get('rotating_secret'));

        Setting::set('rotating_secret', 'second_secret', encrypted: true);
        $this->assertEquals('second_secret', Setting::get('rotating_secret'));
    }
}

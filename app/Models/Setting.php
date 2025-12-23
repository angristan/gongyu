<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class Setting extends Model
{
    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'key',
        'value',
        'encrypted',
    ];

    protected $casts = [
        'encrypted' => 'boolean',
    ];

    public function getValueAttribute(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if ($this->encrypted) {
            try {
                return Crypt::decryptString($value);
            } catch (\Exception) {
                return null;
            }
        }

        return $value;
    }

    public function setValueAttribute(?string $value): void
    {
        if ($value === null) {
            $this->attributes['value'] = null;

            return;
        }

        if ($this->encrypted) {
            $this->attributes['value'] = Crypt::encryptString($value);
        } else {
            $this->attributes['value'] = $value;
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $setting = static::find($key);

        /** @phpstan-ignore nullsafe.neverNull */
        return $setting?->value ?? $default;
    }

    public static function set(string $key, ?string $value, bool $encrypted = false): void
    {
        static::updateOrCreate(
            ['key' => $key],
            ['value' => $value, 'encrypted' => $encrypted]
        );
    }
}

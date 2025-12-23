<?php

declare(strict_types=1);

namespace App\Models;

use App\Search\SqliteSearchDriver;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Bookmark extends Model
{
    use HasFactory;

    protected $fillable = [
        'short_url',
        'url',
        'title',
        'description',
        'thumbnail_url',
        'shaarli_short_url',
    ];

    protected static function booted(): void
    {
        static::creating(function (Bookmark $bookmark) {
            if (empty($bookmark->short_url)) {
                $bookmark->short_url = self::generateUniqueShortUrl();
            }
        });

        // Sync FTS index for SQLite (PostgreSQL uses triggers)
        static::saved(function (Bookmark $bookmark) {
            if (DB::connection()->getDriverName() === 'sqlite') {
                (new SqliteSearchDriver)->updateIndex($bookmark->id);
            }
        });

        static::deleted(function (Bookmark $bookmark) {
            if (DB::connection()->getDriverName() === 'sqlite') {
                (new SqliteSearchDriver)->deleteIndex($bookmark->id);
            }
        });
    }

    /**
     * Generate a unique 8-character short URL.
     */
    public static function generateUniqueShortUrl(): string
    {
        do {
            $shortUrl = Str::random(8);
        } while (self::where('short_url', $shortUrl)->exists());

        return $shortUrl;
    }

    /**
     * Get the route key for the model.
     */
    public function getRouteKeyName(): string
    {
        return 'short_url';
    }
}

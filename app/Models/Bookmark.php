<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
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

        // FTS index is synced automatically via database triggers
        // (SQLite: bookmarks_fts_after_*, PostgreSQL: bookmarks_search_vector_trigger)
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

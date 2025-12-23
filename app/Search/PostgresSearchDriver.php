<?php

declare(strict_types=1);

namespace App\Search;

use App\Models\Bookmark;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class PostgresSearchDriver implements SearchDriver
{
    public function applySearch(Builder $query, string $searchTerm): Builder
    {
        $tsQuery = $this->buildTsQuery($searchTerm);

        return $query
            ->whereRaw("search_vector @@ to_tsquery('english', ?)", [$tsQuery])
            ->orderByRaw("ts_rank(search_vector, to_tsquery('english', ?)) DESC", [$tsQuery]);
    }

    public function updateIndex(int $bookmarkId): void
    {
        $bookmark = Bookmark::find($bookmarkId);
        if (! $bookmark) {
            return;
        }

        DB::statement(
            "UPDATE bookmarks SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(url, '')) WHERE id = ?",
            [$bookmarkId]
        );
    }

    public function deleteIndex(int $bookmarkId): void
    {
        // No separate index to delete for PostgreSQL - the column is part of the row
    }

    private function buildTsQuery(string $searchTerm): string
    {
        // Split by whitespace, escape special chars, join with &
        $words = preg_split('/\s+/', trim($searchTerm), -1, PREG_SPLIT_NO_EMPTY);
        $escaped = array_map(function ($word) {
            // Remove any tsquery special characters
            return preg_replace('/[^a-zA-Z0-9]/', '', $word);
        }, $words);

        // Filter out empty strings
        $filtered = array_filter($escaped);

        if (empty($filtered)) {
            return '';
        }

        // Use :* for prefix matching
        return implode(' & ', array_map(fn ($w) => $w.':*', $filtered));
    }
}

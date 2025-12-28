<?php

declare(strict_types=1);

namespace App\Search;

use Illuminate\Database\Eloquent\Builder;

class PostgresSearchDriver implements SearchDriver
{
    public function applySearch(Builder $query, string $searchTerm): Builder
    {
        $tsQuery = $this->buildTsQuery($searchTerm);

        return $query
            ->whereRaw("search_vector @@ to_tsquery('english', ?)", [$tsQuery])
            ->orderByRaw("ts_rank(search_vector, to_tsquery('english', ?)) DESC", [$tsQuery]);
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

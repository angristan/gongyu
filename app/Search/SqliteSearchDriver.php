<?php

declare(strict_types=1);

namespace App\Search;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class SqliteSearchDriver implements SearchDriver
{
    public function applySearch(Builder $query, string $searchTerm): Builder
    {
        // Check if FTS table exists (might not exist in tests)
        if (! $this->ftsTableExists()) {
            // Fall back to LIKE search
            return $query->where(function ($q) use ($searchTerm) {
                $q->where('title', 'like', "%{$searchTerm}%")
                    ->orWhere('description', 'like', "%{$searchTerm}%")
                    ->orWhere('url', 'like', "%{$searchTerm}%");
            });
        }

        // Use SQLite FTS5 for full-text search
        $ftsQuery = $this->buildFtsQuery($searchTerm);

        return $query
            ->whereIn('bookmarks.id', function ($subquery) use ($ftsQuery) {
                $subquery->select('rowid')
                    ->from('bookmarks_fts')
                    ->whereRaw('bookmarks_fts MATCH ?', [$ftsQuery]);
            })
            ->orderByRaw(
                '(SELECT rank FROM bookmarks_fts WHERE bookmarks_fts.rowid = bookmarks.id AND bookmarks_fts MATCH ?) ASC',
                [$ftsQuery]
            );
    }

    private function ftsTableExists(): bool
    {
        try {
            $result = DB::select("SELECT name FROM sqlite_master WHERE type='table' AND name='bookmarks_fts'");

            return ! empty($result);
        } catch (\Exception $e) {
            return false;
        }
    }

    private function buildFtsQuery(string $searchTerm): string
    {
        // Split by whitespace and create FTS5 query
        $words = preg_split('/\s+/', trim($searchTerm), -1, PREG_SPLIT_NO_EMPTY);

        if (empty($words)) {
            return '""';
        }

        // Escape special FTS5 characters and add * for prefix matching
        $escaped = array_map(function ($word) {
            // Escape quotes
            $word = str_replace('"', '""', $word);
            // Remove other special FTS characters
            $word = preg_replace('/[^a-zA-Z0-9"]/', '', $word);

            return '"'.$word.'"*';
        }, $words);

        return implode(' AND ', $escaped);
    }
}

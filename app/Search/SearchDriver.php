<?php

declare(strict_types=1);

namespace App\Search;

use Illuminate\Database\Eloquent\Builder;

interface SearchDriver
{
    /**
     * Apply full-text search to the query.
     */
    public function applySearch(Builder $query, string $searchTerm): Builder;

    /**
     * Update the search index for a bookmark.
     */
    public function updateIndex(int $bookmarkId): void;

    /**
     * Delete the search index for a bookmark.
     */
    public function deleteIndex(int $bookmarkId): void;
}

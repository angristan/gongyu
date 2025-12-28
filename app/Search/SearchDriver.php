<?php

declare(strict_types=1);

namespace App\Search;

use Illuminate\Database\Eloquent\Builder;

interface SearchDriver
{
    /**
     * Apply full-text search to the query.
     *
     * Index updates are handled automatically via database triggers.
     */
    public function applySearch(Builder $query, string $searchTerm): Builder;
}

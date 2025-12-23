<?php

declare(strict_types=1);

namespace App\Actions\Search;

use App\Models\Bookmark;
use App\Search\PostgresSearchDriver;
use App\Search\SearchDriver;
use App\Search\SqliteSearchDriver;
use Illuminate\Support\Facades\DB;
use Lorisleiva\Actions\Concerns\AsAction;

class SearchBookmarks
{
    use AsAction;

    public function handle(string $query, int $perPage = 20): \Illuminate\Pagination\LengthAwarePaginator
    {
        $driver = $this->getSearchDriver();
        $queryBuilder = Bookmark::query();

        if (! empty($query)) {
            $queryBuilder = $driver->applySearch($queryBuilder, $query);
        } else {
            $queryBuilder->latest();
        }

        return $queryBuilder->paginate($perPage);
    }

    private function getSearchDriver(): SearchDriver
    {
        $connection = DB::connection()->getDriverName();

        return match ($connection) {
            'pgsql' => new PostgresSearchDriver,
            default => new SqliteSearchDriver,
        };
    }
}

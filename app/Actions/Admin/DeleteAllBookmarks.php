<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\Bookmark;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Lorisleiva\Actions\Concerns\AsAction;

class DeleteAllBookmarks
{
    use AsAction;

    /**
     * Delete all bookmarks from the database.
     *
     * @return array{deleted: int}
     */
    public function handle(): array
    {
        $count = Bookmark::count();

        DB::transaction(function () {
            Bookmark::query()->delete();

            // Clear FTS index (SQLite only - PostgreSQL uses column on bookmarks table)
            if (DB::connection()->getDriverName() === 'sqlite') {
                DB::statement('DELETE FROM bookmarks_fts');
            }
        });

        return ['deleted' => $count];
    }

    public function asController(Request $request): RedirectResponse
    {
        $request->validate([
            'confirmation' => 'required|string|in:DELETE ALL BOOKMARKS',
        ]);

        $result = $this->handle();

        return redirect()
            ->route('admin.settings', ['tab' => 'danger'])
            ->with('deleteResult', $result);
    }
}

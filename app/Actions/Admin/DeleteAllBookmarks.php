<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\Bookmark;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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

        // FTS index is cleared automatically via triggers (SQLite and PostgreSQL)
        Bookmark::query()->delete();

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

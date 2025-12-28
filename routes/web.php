<?php

declare(strict_types=1);

use App\Actions\Admin\DeleteAllBookmarks;
use App\Actions\Bookmark\CreateBookmark;
use App\Actions\Bookmark\DeleteBookmark;
use App\Actions\Bookmark\ShowAdminBookmarks;
use App\Actions\Bookmark\UpdateBookmark;
use App\Actions\Dashboard\ShowDashboard;
use App\Actions\Export\ExportBookmarks;
use App\Actions\Feed\GenerateAtomFeed;
use App\Actions\Import\ImportShaarliExport;
use App\Actions\Public\HandleLegacyShaarliUrl;
use App\Actions\Public\ShowBookmarkByShortUrl;
use App\Actions\Public\ShowPublicBookmarks;
use App\Actions\Settings\ShowSettings;
use App\Actions\Settings\UpdateSettings;
use App\Models\Bookmark;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Public routes
Route::get('/', ShowPublicBookmarks::class)->name('home');
Route::get('/b/{shortUrl}', ShowBookmarkByShortUrl::class)->name('bookmark.show');
Route::get('/search', ShowPublicBookmarks::class)->name('search');
Route::get('/feed', GenerateAtomFeed::class)->name('feed');

// Legacy Shaarli URL redirects (301 to new URL)
Route::get('/shaare/{hash}', HandleLegacyShaarliUrl::class)->name('shaare.legacy');

// Setup route (only works if no user exists)
Route::get('/setup', function () {
    if (User::count() > 0) {
        return redirect()->route('home');
    }

    return Inertia::render('Auth/Setup');
})->name('setup');

Route::post('/setup', function (Request $request) {
    if (User::count() > 0) {
        return redirect()->route('home');
    }

    $validated = $request->validate([
        'name' => 'required|string|max:255',
        'email' => 'required|string|email|max:255|unique:users',
        'password' => 'required|string|min:8|confirmed',
    ]);

    $user = User::create([
        'name' => $validated['name'],
        'email' => $validated['email'],
        'password' => bcrypt($validated['password']),
    ]);

    auth()->login($user);

    return redirect()->route('admin.dashboard');
})->name('setup.store');

// Auth routes
Route::get('/login', function () {
    return Inertia::render('Auth/Login');
})->name('login')->middleware('guest');

Route::post('/login', function (Request $request) {
    $credentials = $request->validate([
        'email' => 'required|email',
        'password' => 'required',
    ]);

    if (auth()->attempt($credentials, $request->boolean('remember'))) {
        $request->session()->regenerate();

        return redirect()->intended(route('admin.dashboard'));
    }

    return back()->withErrors([
        'email' => 'The provided credentials do not match our records.',
    ]);
})->name('login.store')->middleware('guest');

Route::post('/logout', function (Request $request) {
    auth()->logout();
    $request->session()->invalidate();
    $request->session()->regenerateToken();

    return redirect()->route('home');
})->name('logout')->middleware('auth');

// Bookmarklet
Route::get('/bookmarklet', function (Request $request) {
    if (! auth()->check()) {
        return redirect()->route('login');
    }

    $existingBookmark = null;
    if ($request->has('url')) {
        $existingBookmark = Bookmark::where('url', $request->input('url'))->first();
    }

    return Inertia::render('Bookmarklet', [
        'existingBookmark' => $existingBookmark,
        'prefill' => [
            'url' => $request->input('url', ''),
            'title' => $request->input('title', ''),
            'description' => $request->input('description', ''),
        ],
        'source' => $request->input('source'),
        'hasSocialProviders' => CreateBookmark::hasSocialProviders(),
    ]);
})->name('bookmarklet');

// Admin routes
Route::prefix('admin')->middleware('auth')->group(function () {
    Route::get('/dashboard', ShowDashboard::class)->name('admin.dashboard');

    // Bookmarks management
    Route::get('/bookmarks', ShowAdminBookmarks::class)->name('admin.bookmarks.index');
    Route::get('/bookmarks/create', CreateBookmark::class)->name('admin.bookmarks.create');
    Route::post('/bookmarks', CreateBookmark::class)->name('admin.bookmarks.store');
    Route::delete('/bookmarks/all', DeleteAllBookmarks::class)->name('admin.bookmarks.deleteAll');
    Route::get('/bookmarks/{bookmark}/edit', UpdateBookmark::class)->name('admin.bookmarks.edit');
    Route::patch('/bookmarks/{bookmark}', UpdateBookmark::class)->name('admin.bookmarks.update');
    Route::delete('/bookmarks/{bookmark}', DeleteBookmark::class)->name('admin.bookmarks.destroy');

    // Import
    Route::get('/import', ImportShaarliExport::class)->name('admin.import');
    Route::post('/import', ImportShaarliExport::class)->name('admin.import.store');

    // Export
    Route::get('/export', ExportBookmarks::class)->name('admin.export');

    // Settings
    Route::get('/settings', ShowSettings::class)->name('admin.settings');
    Route::patch('/settings', UpdateSettings::class)->name('admin.settings.update');
});

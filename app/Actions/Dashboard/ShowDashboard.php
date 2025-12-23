<?php

declare(strict_types=1);

namespace App\Actions\Dashboard;

use App\Models\Bookmark;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Lorisleiva\Actions\Concerns\AsAction;

class ShowDashboard
{
    use AsAction;

    public function handle(): array
    {
        // Total bookmarks
        $totalBookmarks = Bookmark::count();

        // Bookmarks this month
        $bookmarksThisMonth = Bookmark::where('created_at', '>=', now()->startOfMonth())->count();

        // Bookmarks this week
        $bookmarksThisWeek = Bookmark::where('created_at', '>=', now()->startOfWeek())->count();

        // Recent bookmarks
        $recentBookmarks = Bookmark::latest()
            ->take(10)
            ->get(['id', 'short_url', 'title', 'url', 'created_at']);

        // Bookmarks over time (last 30 days)
        $bookmarksOverTime = $this->getBookmarksOverTime(30);

        // Bookmarks by domain (top 10)
        $bookmarksByDomain = $this->getBookmarksByDomain(10);

        return [
            'total_bookmarks' => $totalBookmarks,
            'bookmarks_this_month' => $bookmarksThisMonth,
            'bookmarks_this_week' => $bookmarksThisWeek,
            'recent_bookmarks' => $recentBookmarks,
            'bookmarks_over_time' => $bookmarksOverTime,
            'bookmarks_by_domain' => $bookmarksByDomain,
        ];
    }

    public function asController(): Response
    {
        return Inertia::render('Admin/Dashboard', [
            'stats' => $this->handle(),
        ]);
    }

    private function getBookmarksOverTime(int $days): array
    {
        $startDate = now()->subDays($days)->startOfDay();

        // Get counts per day
        $driver = DB::connection()->getDriverName();

        if ($driver === 'pgsql') {
            $results = DB::table('bookmarks')
                ->select(DB::raw('DATE(created_at) as date'), DB::raw('COUNT(*) as count'))
                ->where('created_at', '>=', $startDate)
                ->groupBy(DB::raw('DATE(created_at)'))
                ->orderBy('date')
                ->get();
        } else {
            $results = DB::table('bookmarks')
                ->select(DB::raw('date(created_at) as date'), DB::raw('COUNT(*) as count'))
                ->where('created_at', '>=', $startDate)
                ->groupBy(DB::raw('date(created_at)'))
                ->orderBy('date')
                ->get();
        }

        // Create a map of date => count
        $countsByDate = $results->pluck('count', 'date')->toArray();

        // Fill in all days
        $data = [];
        for ($i = $days; $i >= 0; $i--) {
            $date = now()->subDays($i)->format('Y-m-d');
            $data[] = [
                'date' => Carbon::parse($date)->format('M d'),
                'count' => (int) ($countsByDate[$date] ?? 0),
            ];
        }

        return $data;
    }

    private function getBookmarksByDomain(int $limit): array
    {
        $bookmarks = Bookmark::all(['url']);

        $domains = [];
        foreach ($bookmarks as $bookmark) {
            $parsed = parse_url($bookmark->url);
            $host = $parsed['host'] ?? null;
            if (! $host) {
                continue;
            }
            // Remove www. prefix
            $host = preg_replace('/^www\./', '', $host);
            $domains[$host] = ($domains[$host] ?? 0) + 1;
        }

        // Sort by count and take top N
        arsort($domains);
        $domains = array_slice($domains, 0, $limit, true);

        $data = [];
        foreach ($domains as $domain => $count) {
            $data[] = [
                'domain' => (string) $domain,
                'count' => (int) $count,
            ];
        }

        return $data;
    }
}

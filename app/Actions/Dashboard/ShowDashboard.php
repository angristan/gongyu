<?php

declare(strict_types=1);

namespace App\Actions\Dashboard;

use App\Models\Bookmark;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Lorisleiva\Actions\Concerns\AsAction;

class ShowDashboard
{
    use AsAction;

    private const PERIODS = ['7d', '30d', '90d', '1y', 'all'];

    public function handle(string $period = '30d'): array
    {
        // Determine date range
        [$rangeStart, $rangeEnd] = $this->getDateRange($period);

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

        // Bookmarks over time (based on selected range)
        $bookmarksOverTime = $this->getBookmarksOverTime($rangeStart, $rangeEnd);

        // Bookmarks by domain (top 10, filtered by date range)
        $bookmarksByDomain = $this->getBookmarksByDomain(10, $rangeStart, $rangeEnd);

        return [
            'total_bookmarks' => $totalBookmarks,
            'bookmarks_this_month' => $bookmarksThisMonth,
            'bookmarks_this_week' => $bookmarksThisWeek,
            'recent_bookmarks' => $recentBookmarks,
            'bookmarks_over_time' => $bookmarksOverTime,
            'bookmarks_by_domain' => $bookmarksByDomain,
        ];
    }

    public function asController(Request $request): Response
    {
        $period = $request->query('period', '30d');

        // Validate period
        if (! in_array($period, self::PERIODS, true)) {
            $period = '30d';
        }

        return Inertia::render('Admin/Dashboard', [
            'stats' => $this->handle($period),
            'filters' => [
                'period' => $period,
            ],
            'bookmarkletUrl' => url('/bookmarklet'),
        ]);
    }

    private function getDateRange(string $period): array
    {
        $end = now()->endOfDay();

        $start = match ($period) {
            '7d' => now()->subDays(7)->startOfDay(),
            '30d' => now()->subDays(30)->startOfDay(),
            '90d' => now()->subDays(90)->startOfDay(),
            '1y' => now()->subYear()->startOfDay(),
            'all' => Bookmark::min('created_at')
                ? Carbon::parse(Bookmark::min('created_at'))->startOfDay()
                : now()->subDays(30)->startOfDay(),
            default => now()->subDays(30)->startOfDay(),
        };

        return [$start, $end];
    }

    private function getBookmarksOverTime(Carbon $startDate, Carbon $endDate): array
    {
        $days = (int) $startDate->diffInDays($endDate);

        // Get counts per day
        $driver = DB::connection()->getDriverName();

        if ($driver === 'pgsql') {
            $results = DB::table('bookmarks')
                ->select(DB::raw('DATE(created_at) as date'), DB::raw('COUNT(*) as count'))
                ->whereBetween('created_at', [$startDate, $endDate])
                ->groupBy(DB::raw('DATE(created_at)'))
                ->orderBy('date')
                ->get();
        } else {
            $results = DB::table('bookmarks')
                ->select(DB::raw('date(created_at) as date'), DB::raw('COUNT(*) as count'))
                ->whereBetween('created_at', [$startDate, $endDate])
                ->groupBy(DB::raw('date(created_at)'))
                ->orderBy('date')
                ->get();
        }

        // Create a map of date => count
        $countsByDate = $results->pluck('count', 'date')->toArray();

        // Include year in date format if data spans multiple years
        $dateFormat = $startDate->year !== $endDate->year ? 'M d, Y' : 'M d';

        // Fill in all days in the range
        $data = [];
        $current = $startDate->copy();
        while ($current <= $endDate) {
            $dateKey = $current->format('Y-m-d');
            $data[] = [
                'date' => $current->format($dateFormat),
                'count' => (int) ($countsByDate[$dateKey] ?? 0),
            ];
            $current->addDay();
        }

        return $data;
    }

    private function getBookmarksByDomain(int $limit, Carbon $startDate, Carbon $endDate): array
    {
        $bookmarks = Bookmark::whereBetween('created_at', [$startDate, $endDate])->get(['url']);

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

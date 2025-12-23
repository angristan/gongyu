import { Head, Link, router } from '@inertiajs/react';
import {
    Box,
    Button,
    Container,
    Group,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import {
    IconHome,
    IconLogout,
    IconPlus,
    IconSettings,
} from '@tabler/icons-react';
import type { Bookmark, PageProps } from '@/types';
import {
    BookmarkletCard,
    ChartsSection,
    RecentBookmarksCard,
    StatisticsCards,
} from './components';

interface Stats {
    total_bookmarks: number;
    bookmarks_this_month: number;
    bookmarks_this_week: number;
    recent_bookmarks: Bookmark[];
    bookmarks_over_time: { date: string; count: number }[];
    bookmarks_by_domain: { domain: string; count: number }[];
}

interface Filters {
    period: string;
}

interface Props extends PageProps {
    stats: Stats;
    filters: Filters;
    bookmarkletUrl: string;
}

export default function Dashboard({
    stats,
    filters,
    auth,
    bookmarkletUrl,
}: Props) {
    const handleLogout = () => {
        router.post('/logout');
    };

    const handlePeriodChange = (value: string) => {
        router.get(
            '/admin/dashboard',
            { period: value },
            { preserveState: true, preserveScroll: true },
        );
    };

    return (
        <>
            <Head title="Dashboard" />
            <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                <Container size="lg">
                    <Stack gap="lg">
                        <Group justify="space-between" align="center">
                            <Title order={1}>Dashboard</Title>
                            <Group>
                                <Button
                                    component={Link}
                                    href="/"
                                    variant="default"
                                    leftSection={<IconHome size={16} />}
                                >
                                    View Site
                                </Button>
                                <Button
                                    component={Link}
                                    href="/admin/bookmarks/create"
                                    leftSection={<IconPlus size={16} />}
                                >
                                    Add Bookmark
                                </Button>
                                <Button
                                    component={Link}
                                    href="/admin/settings"
                                    variant="light"
                                    leftSection={<IconSettings size={16} />}
                                >
                                    Settings
                                </Button>
                                <Button
                                    variant="subtle"
                                    color="gray"
                                    onClick={handleLogout}
                                    leftSection={<IconLogout size={16} />}
                                >
                                    Logout
                                </Button>
                            </Group>
                        </Group>

                        <Text c="dimmed">Welcome back, {auth.user?.name}!</Text>

                        <StatisticsCards
                            totalBookmarks={stats.total_bookmarks}
                            bookmarksThisMonth={stats.bookmarks_this_month}
                            bookmarksThisWeek={stats.bookmarks_this_week}
                        />

                        <ChartsSection
                            bookmarksOverTime={stats.bookmarks_over_time}
                            bookmarksByDomain={stats.bookmarks_by_domain}
                            period={filters.period}
                            onPeriodChange={handlePeriodChange}
                        />

                        <RecentBookmarksCard
                            bookmarks={stats.recent_bookmarks}
                        />

                        <BookmarkletCard bookmarkletUrl={bookmarkletUrl} />
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

import { Head, Link, router } from '@inertiajs/react';
import { AreaChart, BarChart } from '@mantine/charts';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Card,
    Code,
    Container,
    CopyButton,
    Group,
    Paper,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconBookmark,
    IconCalendar,
    IconCalendarWeek,
    IconCheck,
    IconCopy,
    IconHome,
    IconLogout,
    IconPlus,
    IconSettings,
} from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import type { Bookmark, PageProps } from '@/types';

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

const PERIOD_OPTIONS = [
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: '1y', label: '1Y' },
    { value: 'all', label: 'All' },
];

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

    const bookmarkletCode = `javascript:(function(){window.open('${bookmarkletUrl}?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&description='+encodeURIComponent(window.getSelection())+'&source=bookmarklet','gongyu','width=600,height=500');})();`;

    const bookmarkletRef = useRef<HTMLAnchorElement>(null);

    useEffect(() => {
        if (bookmarkletRef.current) {
            bookmarkletRef.current.setAttribute('href', bookmarkletCode);
        }
    }, [bookmarkletCode]);

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

                        <SimpleGrid cols={{ base: 1, sm: 3 }}>
                            <Paper withBorder p="md" radius="md">
                                <Group justify="space-between">
                                    <div>
                                        <Text
                                            c="dimmed"
                                            size="xs"
                                            tt="uppercase"
                                            fw={700}
                                        >
                                            Total Bookmarks
                                        </Text>
                                        <Text fw={700} size="xl">
                                            {stats.total_bookmarks}
                                        </Text>
                                    </div>
                                    <IconBookmark
                                        size={32}
                                        color="var(--mantine-color-blue-6)"
                                    />
                                </Group>
                            </Paper>
                            <Paper withBorder p="md" radius="md">
                                <Group justify="space-between">
                                    <div>
                                        <Text
                                            c="dimmed"
                                            size="xs"
                                            tt="uppercase"
                                            fw={700}
                                        >
                                            This Month
                                        </Text>
                                        <Text fw={700} size="xl">
                                            {stats.bookmarks_this_month}
                                        </Text>
                                    </div>
                                    <IconCalendar
                                        size={32}
                                        color="var(--mantine-color-green-6)"
                                    />
                                </Group>
                            </Paper>
                            <Paper withBorder p="md" radius="md">
                                <Group justify="space-between">
                                    <div>
                                        <Text
                                            c="dimmed"
                                            size="xs"
                                            tt="uppercase"
                                            fw={700}
                                        >
                                            This Week
                                        </Text>
                                        <Text fw={700} size="xl">
                                            {stats.bookmarks_this_week}
                                        </Text>
                                    </div>
                                    <IconCalendarWeek
                                        size={32}
                                        color="var(--mantine-color-orange-6)"
                                    />
                                </Group>
                            </Paper>
                        </SimpleGrid>

                        <Card withBorder p="lg">
                            <Group justify="space-between" mb="md">
                                <Title order={4}>Charts</Title>
                                <SegmentedControl
                                    size="xs"
                                    value={filters.period}
                                    onChange={handlePeriodChange}
                                    data={PERIOD_OPTIONS}
                                />
                            </Group>
                            <SimpleGrid cols={{ base: 1, md: 2 }}>
                                <div>
                                    <Text size="sm" fw={500} mb="sm">
                                        Bookmarks Over Time
                                    </Text>
                                    {stats.bookmarks_over_time.length > 0 ? (
                                        <AreaChart
                                            h={200}
                                            data={stats.bookmarks_over_time}
                                            dataKey="date"
                                            series={[
                                                {
                                                    name: 'count',
                                                    color: 'blue.6',
                                                },
                                            ]}
                                            curveType="monotone"
                                            withDots={false}
                                        />
                                    ) : (
                                        <Text c="dimmed" ta="center" py="xl">
                                            No data yet
                                        </Text>
                                    )}
                                </div>

                                <div>
                                    <Text size="sm" fw={500} mb="sm">
                                        Top Domains
                                    </Text>
                                    {stats.bookmarks_by_domain.length > 0 ? (
                                        <BarChart
                                            h={200}
                                            data={stats.bookmarks_by_domain}
                                            dataKey="domain"
                                            series={[
                                                {
                                                    name: 'count',
                                                    label: 'Bookmarks',
                                                    color: 'violet.6',
                                                },
                                            ]}
                                            tickLine="none"
                                        />
                                    ) : (
                                        <Text c="dimmed" ta="center" py="xl">
                                            No data yet
                                        </Text>
                                    )}
                                </div>
                            </SimpleGrid>
                        </Card>

                        <Card withBorder p="lg">
                            <Group justify="space-between" mb="md">
                                <Title order={4}>Recent Bookmarks</Title>
                                <Button
                                    component={Link}
                                    href="/admin/bookmarks"
                                    variant="subtle"
                                    size="xs"
                                >
                                    View All
                                </Button>
                            </Group>
                            {stats.recent_bookmarks.length > 0 ? (
                                <Table>
                                    <Table.Tbody>
                                        {stats.recent_bookmarks.map(
                                            (bookmark) => (
                                                <Table.Tr key={bookmark.id}>
                                                    <Table.Td>
                                                        <Text
                                                            fw={500}
                                                            lineClamp={1}
                                                        >
                                                            {bookmark.title}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Badge
                                                            size="xs"
                                                            variant="light"
                                                        >
                                                            {new URL(
                                                                bookmark.url,
                                                            ).hostname.replace(
                                                                'www.',
                                                                '',
                                                            )}
                                                        </Badge>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text
                                                            size="sm"
                                                            c="dimmed"
                                                        >
                                                            {new Date(
                                                                bookmark.created_at,
                                                            ).toLocaleDateString()}
                                                        </Text>
                                                    </Table.Td>
                                                </Table.Tr>
                                            ),
                                        )}
                                    </Table.Tbody>
                                </Table>
                            ) : (
                                <Text c="dimmed" ta="center" py="xl">
                                    No bookmarks yet
                                </Text>
                            )}
                        </Card>

                        <Card withBorder p="lg">
                            <Stack gap="md">
                                <Title order={4}>Bookmarklet</Title>
                                <Text size="sm" c="dimmed">
                                    Drag the button below to your bookmarks bar,
                                    or copy the code to create a bookmarklet
                                    manually.
                                </Text>

                                <Group>
                                    <a
                                        ref={bookmarkletRef}
                                        onClick={(e) => e.preventDefault()}
                                        draggable
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius:
                                                'var(--mantine-radius-default)',
                                            backgroundColor:
                                                'var(--mantine-color-blue-filled)',
                                            color: 'white',
                                            textDecoration: 'none',
                                            fontSize:
                                                'var(--mantine-font-size-sm)',
                                            fontWeight: 600,
                                            cursor: 'grab',
                                        }}
                                    >
                                        + Add to Gongyu
                                    </a>
                                    <Text size="sm" c="dimmed">
                                        Drag this to your bookmarks bar
                                    </Text>
                                </Group>

                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="sm" fw={500}>
                                            Bookmarklet Code
                                        </Text>
                                        <CopyButton value={bookmarkletCode}>
                                            {({ copied, copy }) => (
                                                <Tooltip
                                                    label={
                                                        copied
                                                            ? 'Copied'
                                                            : 'Copy'
                                                    }
                                                >
                                                    <ActionIcon
                                                        variant="subtle"
                                                        onClick={copy}
                                                    >
                                                        {copied ? (
                                                            <IconCheck
                                                                size={16}
                                                            />
                                                        ) : (
                                                            <IconCopy
                                                                size={16}
                                                            />
                                                        )}
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                        </CopyButton>
                                    </Group>
                                    <Code
                                        block
                                        style={{
                                            wordBreak: 'break-all',
                                        }}
                                    >
                                        {bookmarkletCode}
                                    </Code>
                                </Stack>
                            </Stack>
                        </Card>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

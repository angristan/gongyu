import { Head, Link, router } from '@inertiajs/react';
import { AreaChart, BarChart } from '@mantine/charts';
import {
    Badge,
    Box,
    Button,
    Card,
    Container,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import {
    IconBookmark,
    IconCalendar,
    IconCalendarWeek,
    IconLogout,
    IconPlus,
    IconSettings,
} from '@tabler/icons-react';
import type { Bookmark, PageProps } from '@/types';

interface Stats {
    total_bookmarks: number;
    bookmarks_this_month: number;
    bookmarks_this_week: number;
    recent_bookmarks: Bookmark[];
    bookmarks_over_time: { date: string; count: number }[];
    bookmarks_by_domain: { domain: string; count: number }[];
}

interface Props extends PageProps {
    stats: Stats;
}

export default function Dashboard({ stats, auth }: Props) {
    const handleLogout = () => {
        router.post('/logout');
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

                        <SimpleGrid cols={{ base: 1, md: 2 }}>
                            <Card withBorder p="lg">
                                <Title order={4} mb="md">
                                    Bookmarks Over Time (30 days)
                                </Title>
                                {stats.bookmarks_over_time.length > 0 ? (
                                    <AreaChart
                                        h={200}
                                        data={stats.bookmarks_over_time}
                                        dataKey="date"
                                        series={[
                                            { name: 'count', color: 'blue.6' },
                                        ]}
                                        curveType="monotone"
                                        withDots={false}
                                    />
                                ) : (
                                    <Text c="dimmed" ta="center" py="xl">
                                        No data yet
                                    </Text>
                                )}
                            </Card>

                            <Card withBorder p="lg">
                                <Title order={4} mb="md">
                                    Top Domains
                                </Title>
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
                            </Card>
                        </SimpleGrid>

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

                        <Card withBorder p="xl">
                            <Stack gap="md">
                                <Title order={4}>Quick Actions</Title>
                                <Group>
                                    <Button
                                        component={Link}
                                        href="/admin/bookmarks"
                                        variant="light"
                                    >
                                        View All Bookmarks
                                    </Button>
                                    <Button
                                        component={Link}
                                        href="/admin/import"
                                        variant="light"
                                    >
                                        Import from Shaarli
                                    </Button>
                                    <Button
                                        component={Link}
                                        href="/"
                                        variant="subtle"
                                    >
                                        View Public Site
                                    </Button>
                                </Group>
                            </Stack>
                        </Card>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

import { Group, Paper, SimpleGrid, Text } from '@mantine/core';
import {
    IconBookmark,
    IconCalendar,
    IconCalendarWeek,
} from '@tabler/icons-react';

interface Props {
    totalBookmarks: number;
    bookmarksThisMonth: number;
    bookmarksThisWeek: number;
}

export function StatisticsCards({
    totalBookmarks,
    bookmarksThisMonth,
    bookmarksThisWeek,
}: Props) {
    return (
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Paper className="cozy-card" p="md" radius="md">
                <Group justify="space-between">
                    <div>
                        <Text
                            className="cozy-muted"
                            size="xs"
                            tt="uppercase"
                            fw={700}
                        >
                            Total Bookmarks
                        </Text>
                        <Text fw={700} size="xl" className="cozy-title">
                            {totalBookmarks}
                        </Text>
                    </div>
                    <IconBookmark
                        size={32}
                        color="var(--mantine-color-cozy-6)"
                    />
                </Group>
            </Paper>
            <Paper className="cozy-card" p="md" radius="md">
                <Group justify="space-between">
                    <div>
                        <Text
                            className="cozy-muted"
                            size="xs"
                            tt="uppercase"
                            fw={700}
                        >
                            This Month
                        </Text>
                        <Text fw={700} size="xl" className="cozy-title">
                            {bookmarksThisMonth}
                        </Text>
                    </div>
                    <IconCalendar
                        size={32}
                        color="var(--mantine-color-green-6)"
                    />
                </Group>
            </Paper>
            <Paper className="cozy-card" p="md" radius="md">
                <Group justify="space-between">
                    <div>
                        <Text
                            className="cozy-muted"
                            size="xs"
                            tt="uppercase"
                            fw={700}
                        >
                            This Week
                        </Text>
                        <Text fw={700} size="xl" className="cozy-title">
                            {bookmarksThisWeek}
                        </Text>
                    </div>
                    <IconCalendarWeek
                        size={32}
                        color="var(--mantine-color-orange-6)"
                    />
                </Group>
            </Paper>
        </SimpleGrid>
    );
}

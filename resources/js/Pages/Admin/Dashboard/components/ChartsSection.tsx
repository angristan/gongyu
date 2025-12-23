import { AreaChart, BarChart } from '@mantine/charts';
import {
    Card,
    Group,
    SegmentedControl,
    SimpleGrid,
    Text,
    Title,
} from '@mantine/core';

interface Props {
    bookmarksOverTime: { date: string; count: number }[];
    bookmarksByDomain: { domain: string; count: number }[];
    period: string;
    onPeriodChange: (value: string) => void;
}

const PERIOD_OPTIONS = [
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: '1y', label: '1Y' },
    { value: 'all', label: 'All' },
];

export function ChartsSection({
    bookmarksOverTime,
    bookmarksByDomain,
    period,
    onPeriodChange,
}: Props) {
    return (
        <Card withBorder p="lg">
            <Group justify="space-between" mb="md">
                <Title order={4}>Charts</Title>
                <SegmentedControl
                    size="xs"
                    value={period}
                    onChange={onPeriodChange}
                    data={PERIOD_OPTIONS}
                />
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2 }}>
                <div>
                    <Text size="sm" fw={500} mb="sm">
                        Bookmarks Over Time
                    </Text>
                    {bookmarksOverTime.length > 0 ? (
                        <AreaChart
                            h={200}
                            data={bookmarksOverTime}
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
                    {bookmarksByDomain.length > 0 ? (
                        <BarChart
                            h={200}
                            data={bookmarksByDomain}
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
    );
}

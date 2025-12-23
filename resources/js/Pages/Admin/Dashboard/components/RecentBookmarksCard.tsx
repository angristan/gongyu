import { Link } from '@inertiajs/react';
import { Badge, Button, Card, Group, Table, Text, Title } from '@mantine/core';
import type { Bookmark } from '@/types';

interface Props {
    bookmarks: Bookmark[];
}

export function RecentBookmarksCard({ bookmarks }: Props) {
    return (
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
            {bookmarks.length > 0 ? (
                <Table>
                    <Table.Tbody>
                        {bookmarks.map((bookmark) => (
                            <Table.Tr key={bookmark.id}>
                                <Table.Td>
                                    <Text fw={500} lineClamp={1}>
                                        {bookmark.title}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Badge size="xs" variant="light">
                                        {new URL(bookmark.url).hostname.replace(
                                            'www.',
                                            '',
                                        )}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        {new Date(
                                            bookmark.created_at,
                                        ).toLocaleDateString()}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            ) : (
                <Text c="dimmed" ta="center" py="xl">
                    No bookmarks yet
                </Text>
            )}
        </Card>
    );
}

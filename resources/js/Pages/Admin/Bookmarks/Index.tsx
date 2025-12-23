import { Head, Link, router } from '@inertiajs/react';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Card,
    Container,
    Group,
    Menu,
    Pagination,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import {
    IconDotsVertical,
    IconEdit,
    IconExternalLink,
    IconHome,
    IconPlus,
    IconSearch,
    IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import type { Bookmark, PageProps } from '@/types';

interface PaginatedBookmarks {
    data: Bookmark[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props extends PageProps {
    bookmarks: PaginatedBookmarks;
    search: string | null;
}

export default function Index({ bookmarks, search }: Props) {
    const [searchValue, setSearchValue] = useState(search || '');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        router.get(
            '/admin/bookmarks',
            { q: searchValue || undefined },
            { preserveState: true },
        );
    };

    const handleDelete = (bookmark: Bookmark) => {
        if (confirm('Are you sure you want to delete this bookmark?')) {
            router.delete(`/admin/bookmarks/${bookmark.short_url}`);
        }
    };

    return (
        <>
            <Head title="Bookmarks" />
            <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                <Container size="lg">
                    <Stack gap="lg">
                        <Group justify="space-between" align="center">
                            <Title order={1}>Bookmarks</Title>
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
                                    href="/admin/dashboard"
                                    variant="light"
                                >
                                    Dashboard
                                </Button>
                            </Group>
                        </Group>

                        <form onSubmit={handleSearch}>
                            <TextInput
                                placeholder="Search bookmarks..."
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                leftSection={<IconSearch size={16} />}
                            />
                        </form>

                        {bookmarks.data.length === 0 ? (
                            <Card withBorder p="xl">
                                <Text c="dimmed" ta="center">
                                    {search
                                        ? 'No bookmarks found matching your search.'
                                        : 'No bookmarks yet. Add your first one!'}
                                </Text>
                            </Card>
                        ) : (
                            <>
                                <Card withBorder p={0}>
                                    <Table striped highlightOnHover>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Title</Table.Th>
                                                <Table.Th>URL</Table.Th>
                                                <Table.Th>Created</Table.Th>
                                                <Table.Th w={50}></Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {bookmarks.data.map((bookmark) => (
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
                                                        <Group gap="xs">
                                                            <Badge
                                                                size="xs"
                                                                variant="light"
                                                            >
                                                                {
                                                                    new URL(
                                                                        bookmark.url,
                                                                    ).hostname
                                                                }
                                                            </Badge>
                                                            <ActionIcon
                                                                component="a"
                                                                href={
                                                                    bookmark.url
                                                                }
                                                                target="_blank"
                                                                size="xs"
                                                                variant="subtle"
                                                            >
                                                                <IconExternalLink
                                                                    size={12}
                                                                />
                                                            </ActionIcon>
                                                        </Group>
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
                                                    <Table.Td>
                                                        <Menu
                                                            shadow="md"
                                                            width={150}
                                                        >
                                                            <Menu.Target>
                                                                <ActionIcon variant="subtle">
                                                                    <IconDotsVertical
                                                                        size={
                                                                            16
                                                                        }
                                                                    />
                                                                </ActionIcon>
                                                            </Menu.Target>
                                                            <Menu.Dropdown>
                                                                <Menu.Item
                                                                    component={
                                                                        Link
                                                                    }
                                                                    href={`/admin/bookmarks/${bookmark.short_url}/edit`}
                                                                    leftSection={
                                                                        <IconEdit
                                                                            size={
                                                                                14
                                                                            }
                                                                        />
                                                                    }
                                                                >
                                                                    Edit
                                                                </Menu.Item>
                                                                <Menu.Item
                                                                    color="red"
                                                                    leftSection={
                                                                        <IconTrash
                                                                            size={
                                                                                14
                                                                            }
                                                                        />
                                                                    }
                                                                    onClick={() =>
                                                                        handleDelete(
                                                                            bookmark,
                                                                        )
                                                                    }
                                                                >
                                                                    Delete
                                                                </Menu.Item>
                                                            </Menu.Dropdown>
                                                        </Menu>
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                </Card>

                                {bookmarks.last_page > 1 && (
                                    <Group justify="center">
                                        <Pagination
                                            total={bookmarks.last_page}
                                            value={bookmarks.current_page}
                                            onChange={(page) => {
                                                router.get(
                                                    '/admin/bookmarks',
                                                    {
                                                        page,
                                                        q: search || undefined,
                                                    },
                                                    { preserveState: true },
                                                );
                                            }}
                                        />
                                    </Group>
                                )}
                            </>
                        )}
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

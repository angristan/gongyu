import { Head, router } from '@inertiajs/react';
import {
    Anchor,
    Badge,
    Box,
    Card,
    Container,
    Group,
    Image,
    Pagination,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
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

export default function Index({ bookmarks, search, auth }: Props) {
    const [searchValue, setSearchValue] = useState(search || '');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        router.get(
            '/',
            { q: searchValue || undefined },
            { preserveState: true },
        );
    };

    return (
        <>
            <Head title="Bookmarks" />
            <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                <Container size="md">
                    <Stack gap="lg">
                        <Group justify="space-between" align="center">
                            <Group gap="sm">
                                <Image
                                    src="/images/logo.png"
                                    alt="Gongyu"
                                    h={40}
                                    w={40}
                                    fit="contain"
                                    style={{
                                        filter: 'drop-shadow(0 1px 3px rgba(255, 255, 255, 0.15))',
                                    }}
                                />
                                <Title order={1}>Gongyu</Title>
                            </Group>
                            {auth.user ? (
                                <Anchor href="/admin/dashboard">
                                    Dashboard
                                </Anchor>
                            ) : (
                                <Anchor href="/login">Login</Anchor>
                            )}
                        </Group>

                        <Text c="dimmed">A simple bookmark manager</Text>

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
                                        : 'No bookmarks yet.'}
                                </Text>
                            </Card>
                        ) : (
                            <>
                                <Stack gap="md">
                                    {bookmarks.data.map((bookmark) => (
                                        <Card
                                            key={bookmark.id}
                                            withBorder
                                            p="md"
                                        >
                                            <Stack gap="xs">
                                                <Anchor
                                                    href={bookmark.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    fw={500}
                                                >
                                                    {bookmark.title}
                                                </Anchor>
                                                {bookmark.description && (
                                                    <Text size="sm" c="dimmed">
                                                        {bookmark.description}
                                                    </Text>
                                                )}
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
                                                    <Text size="xs" c="dimmed">
                                                        {new Date(
                                                            bookmark.created_at,
                                                        ).toLocaleDateString()}
                                                    </Text>
                                                </Group>
                                            </Stack>
                                        </Card>
                                    ))}
                                </Stack>

                                {bookmarks.last_page > 1 && (
                                    <Group justify="center">
                                        <Pagination
                                            total={bookmarks.last_page}
                                            value={bookmarks.current_page}
                                            onChange={(page) => {
                                                router.get(
                                                    '/',
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

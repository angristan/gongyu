import { useUmami } from '@danielgtmn/umami-react';
import { Head, router } from '@inertiajs/react';
import {
    ActionIcon,
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
    useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconRss, IconSearch, IconSun } from '@tabler/icons-react';
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
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const { track } = useUmami();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        track('search', { query: searchValue });
        router.get(
            '/',
            { q: searchValue || undefined },
            { preserveState: true },
        );
    };

    return (
        <>
            <Head title="Bookmarks" />
            <Box className="cozy-background" mih="100vh" py="xl">
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
                                />
                                <Title order={1} className="cozy-title">
                                    Gongyu
                                </Title>
                            </Group>
                            {auth.user ? (
                                <Anchor
                                    href="/admin/dashboard"
                                    className="cozy-link"
                                    fw={500}
                                >
                                    Dashboard
                                </Anchor>
                            ) : (
                                <Anchor
                                    href="/login"
                                    className="cozy-link"
                                    fw={500}
                                >
                                    Login
                                </Anchor>
                            )}
                        </Group>

                        <Text className="cozy-text">
                            A simple bookmark manager
                        </Text>

                        <form onSubmit={handleSearch}>
                            <TextInput
                                placeholder="Search bookmarks..."
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                leftSection={<IconSearch size={16} />}
                                className="cozy-input"
                            />
                        </form>

                        {bookmarks.data.length === 0 ? (
                            <Card className="cozy-card" p="xl" radius="md">
                                <Text className="cozy-text" ta="center">
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
                                            className="cozy-card"
                                            p="md"
                                            radius="md"
                                        >
                                            <Stack gap="xs">
                                                <Anchor
                                                    href={bookmark.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    fw={500}
                                                    className="cozy-link"
                                                    onClick={() =>
                                                        track(
                                                            'bookmark_click',
                                                            {
                                                                url: bookmark.url,
                                                                title: bookmark.title,
                                                            },
                                                        )
                                                    }
                                                >
                                                    {bookmark.title}
                                                </Anchor>
                                                {bookmark.description && (
                                                    <Text
                                                        size="sm"
                                                        className="cozy-text"
                                                    >
                                                        {bookmark.description}
                                                    </Text>
                                                )}
                                                <Group gap="xs">
                                                    <Badge
                                                        size="xs"
                                                        variant="filled"
                                                        className="cozy-badge"
                                                    >
                                                        {
                                                            new URL(
                                                                bookmark.url,
                                                            ).hostname
                                                        }
                                                    </Badge>
                                                    <Anchor
                                                        href={`/b/${bookmark.short_url}`}
                                                        size="xs"
                                                        className="cozy-muted"
                                                        underline="never"
                                                    >
                                                        {new Date(
                                                            bookmark.created_at,
                                                        ).toLocaleDateString()}
                                                    </Anchor>
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
                                                track('pagination', { page });
                                                router.get(
                                                    '/',
                                                    {
                                                        page,
                                                        q: search || undefined,
                                                    },
                                                    { preserveState: true },
                                                );
                                            }}
                                            color="cozy"
                                        />
                                    </Group>
                                )}
                            </>
                        )}
                    </Stack>

                    <Group justify="space-between" mt="xl" pt="xl">
                        <Text size="sm" className="cozy-muted">
                            Powered by{' '}
                            <Anchor
                                href="https://github.com/angristan/gongyu"
                                target="_blank"
                                rel="noopener noreferrer"
                                size="sm"
                                className="cozy-text"
                            >
                                Gongyu
                            </Anchor>
                        </Text>
                        <Group gap="xs">
                            <ActionIcon
                                component="a"
                                href="/feed"
                                variant="subtle"
                                className="cozy-text"
                                aria-label="RSS feed"
                                onClick={() => track('rss_feed_click')}
                            >
                                <IconRss size={18} />
                            </ActionIcon>
                            <ActionIcon
                                variant="subtle"
                                className="cozy-text"
                                onClick={() => {
                                    track('theme_toggle', {
                                        to:
                                            colorScheme === 'dark'
                                                ? 'light'
                                                : 'dark',
                                    });
                                    toggleColorScheme();
                                }}
                                aria-label="Toggle color scheme"
                            >
                                {colorScheme === 'dark' ? (
                                    <IconSun size={18} />
                                ) : (
                                    <IconMoon size={18} />
                                )}
                            </ActionIcon>
                        </Group>
                    </Group>
                </Container>
            </Box>
        </>
    );
}

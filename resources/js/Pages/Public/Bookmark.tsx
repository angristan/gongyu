import { Head, Link } from '@inertiajs/react';
import {
    Badge,
    Box,
    Button,
    Card,
    Container,
    Group,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconArrowLeft, IconExternalLink } from '@tabler/icons-react';
import type { Bookmark, PageProps } from '@/types';

interface Props extends PageProps {
    bookmark: Bookmark;
}

export default function BookmarkPage({ bookmark, auth }: Props) {
    return (
        <>
            <Head title={bookmark.title} />
            <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                <Container size="md">
                    <Stack gap="lg">
                        <Group>
                            <Button
                                component={Link}
                                href="/"
                                variant="subtle"
                                leftSection={<IconArrowLeft size={16} />}
                            >
                                All Bookmarks
                            </Button>
                        </Group>

                        <Card withBorder p="xl">
                            <Stack gap="md">
                                <Title order={2}>{bookmark.title}</Title>

                                <Group gap="xs">
                                    <Badge size="sm" variant="light">
                                        {new URL(bookmark.url).hostname}
                                    </Badge>
                                    <Text size="sm" c="dimmed">
                                        {new Date(
                                            bookmark.created_at,
                                        ).toLocaleDateString()}
                                    </Text>
                                </Group>

                                {bookmark.description && (
                                    <Text>{bookmark.description}</Text>
                                )}

                                <Group>
                                    <Button
                                        component="a"
                                        href={bookmark.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        leftSection={
                                            <IconExternalLink size={16} />
                                        }
                                    >
                                        Visit Link
                                    </Button>
                                    {auth.user && (
                                        <Button
                                            component={Link}
                                            href={`/admin/bookmarks/${bookmark.short_url}/edit`}
                                            variant="light"
                                        >
                                            Edit
                                        </Button>
                                    )}
                                </Group>
                            </Stack>
                        </Card>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ActionIcon,
    Box,
    Button,
    Card,
    Container,
    Group,
    Loader,
    Stack,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import type { Bookmark, PageProps } from '@/types';

interface Props extends PageProps {
    bookmark: Bookmark;
}

export default function Edit({ bookmark }: Props) {
    const { data, setData, patch, processing, errors } = useForm({
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description || '',
    });

    const [fetchingMetadata, setFetchingMetadata] = useState(false);

    const fetchMetadata = useCallback(async () => {
        if (!data.url) return;

        try {
            new URL(data.url);
        } catch {
            return;
        }

        setFetchingMetadata(true);
        try {
            const response = await fetch('/admin/bookmarks/fetch-metadata', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN':
                        document.querySelector<HTMLMetaElement>(
                            'meta[name="csrf-token"]',
                        )?.content || '',
                },
                body: JSON.stringify({ url: data.url }),
            });

            if (response.ok) {
                const metadata = await response.json();
                if (metadata.title) {
                    setData('title', metadata.title);
                }
                if (metadata.description) {
                    setData('description', metadata.description);
                }
            }
        } catch {
            // Ignore fetch errors
        } finally {
            setFetchingMetadata(false);
        }
    }, [data.url, setData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        patch(`/admin/bookmarks/${bookmark.short_url}`);
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this bookmark?')) {
            router.delete(`/admin/bookmarks/${bookmark.short_url}`);
        }
    };

    return (
        <>
            <Head title="Edit Bookmark" />
            <Box className="cozy-background" mih="100vh" py="xl">
                <Container size="sm">
                    <Stack gap="lg">
                        <Group>
                            <Button
                                component={Link}
                                href="/admin/bookmarks"
                                variant="subtle"
                                leftSection={<IconArrowLeft size={16} />}
                            >
                                Back
                            </Button>
                        </Group>

                        <Title order={1} className="cozy-title">
                            Edit Bookmark
                        </Title>

                        <Card className="cozy-card" p="xl" radius="md">
                            <form onSubmit={handleSubmit}>
                                <Stack gap="md">
                                    <TextInput
                                        label="URL"
                                        placeholder="https://example.com/article"
                                        value={data.url}
                                        onChange={(e) =>
                                            setData('url', e.target.value)
                                        }
                                        error={errors.url}
                                        required
                                    />
                                    <TextInput
                                        label="Title"
                                        placeholder="Article Title"
                                        value={data.title}
                                        onChange={(e) =>
                                            setData('title', e.target.value)
                                        }
                                        error={errors.title}
                                        required
                                        rightSection={
                                            fetchingMetadata ? (
                                                <Loader size="xs" />
                                            ) : (
                                                <Tooltip label="Fetch title from URL">
                                                    <ActionIcon
                                                        variant="subtle"
                                                        onClick={fetchMetadata}
                                                    >
                                                        <IconRefresh
                                                            size={16}
                                                        />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )
                                        }
                                    />
                                    <Textarea
                                        label="Description"
                                        placeholder="Optional description or notes..."
                                        value={data.description}
                                        onChange={(e) =>
                                            setData(
                                                'description',
                                                e.target.value,
                                            )
                                        }
                                        error={errors.description}
                                        minRows={3}
                                    />
                                    <Group justify="space-between">
                                        <Button
                                            type="submit"
                                            loading={processing}
                                        >
                                            Save Changes
                                        </Button>
                                        <Button
                                            color="red"
                                            variant="light"
                                            onClick={handleDelete}
                                        >
                                            Delete
                                        </Button>
                                    </Group>
                                </Stack>
                            </form>
                        </Card>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

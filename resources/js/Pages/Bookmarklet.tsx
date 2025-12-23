import { Head, router, useForm } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    Card,
    Checkbox,
    Container,
    Group,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useState } from 'react';
import type { Bookmark, PageProps } from '@/types';

interface Props extends PageProps {
    existingBookmark: Bookmark | null;
    prefill: {
        url: string;
        title: string;
        description: string;
    };
    source: string | null;
    hasSocialProviders: boolean;
}

export default function Bookmarklet({
    existingBookmark,
    prefill,
    source,
    hasSocialProviders,
}: Props) {
    const [saved, setSaved] = useState(false);
    const isPopup = source === 'bookmarklet';

    const { data, setData, post, processing, errors } = useForm({
        url: prefill.url,
        title: prefill.title,
        description: prefill.description,
        share_social: hasSocialProviders,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/admin/bookmarks', {
            onSuccess: () => {
                setSaved(true);
                if (isPopup) {
                    setTimeout(() => window.close(), 1500);
                }
            },
        });
    };

    if (existingBookmark) {
        return (
            <>
                <Head title="Bookmark Exists" />
                <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                    <Container size="sm">
                        <Stack gap="lg">
                            <Title order={2}>Bookmark Exists</Title>

                            <Alert
                                icon={<IconAlertCircle size={16} />}
                                color="yellow"
                            >
                                This URL has already been bookmarked.
                            </Alert>

                            <Card withBorder p="lg">
                                <Stack gap="md">
                                    <Text fw={500}>
                                        {existingBookmark.title}
                                    </Text>
                                    <Text size="sm" c="dimmed" lineClamp={1}>
                                        {existingBookmark.url}
                                    </Text>
                                    {existingBookmark.description && (
                                        <Text size="sm">
                                            {existingBookmark.description}
                                        </Text>
                                    )}
                                    <Group>
                                        <Button
                                            onClick={() =>
                                                router.get(
                                                    `/admin/bookmarks/${existingBookmark.short_url}/edit`,
                                                )
                                            }
                                        >
                                            Edit Bookmark
                                        </Button>
                                        {isPopup && (
                                            <Button
                                                variant="light"
                                                onClick={() => window.close()}
                                            >
                                                Close
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

    if (saved) {
        return (
            <>
                <Head title="Saved!" />
                <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                    <Container size="sm">
                        <Stack
                            gap="lg"
                            align="center"
                            justify="center"
                            mih={200}
                        >
                            <IconCheck
                                size={48}
                                color="var(--mantine-color-green-6)"
                            />
                            <Title order={2}>Bookmark Saved!</Title>
                            <Text c="dimmed">
                                {isPopup
                                    ? 'This window will close automatically...'
                                    : 'Your bookmark has been saved.'}
                            </Text>
                            {!isPopup && (
                                <Button
                                    onClick={() =>
                                        router.get('/admin/bookmarks')
                                    }
                                >
                                    View All Bookmarks
                                </Button>
                            )}
                        </Stack>
                    </Container>
                </Box>
            </>
        );
    }

    return (
        <>
            <Head title="Add Bookmark" />
            <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                <Container size="sm">
                    <Stack gap="lg">
                        <Title order={2}>Add Bookmark</Title>

                        <Card withBorder p="xl">
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
                                    {hasSocialProviders && (
                                        <Checkbox
                                            label="Share to social media"
                                            checked={data.share_social}
                                            onChange={(e) =>
                                                setData(
                                                    'share_social',
                                                    e.currentTarget.checked,
                                                )
                                            }
                                        />
                                    )}
                                    <Group>
                                        <Button
                                            type="submit"
                                            loading={processing}
                                        >
                                            Save Bookmark
                                        </Button>
                                        {isPopup && (
                                            <Button
                                                variant="light"
                                                onClick={() => window.close()}
                                            >
                                                Cancel
                                            </Button>
                                        )}
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

import { Head, Link, useForm } from '@inertiajs/react';
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
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import type { Bookmark, PageProps } from '@/types';

interface Props extends PageProps {
    existingBookmark: Bookmark | null;
    prefill: {
        url: string;
        title: string;
        description: string;
    };
}

export default function Create({ existingBookmark, prefill }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        url: prefill.url,
        title: prefill.title,
        description: prefill.description,
        share_social: false,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/admin/bookmarks');
    };

    if (existingBookmark) {
        return (
            <>
                <Head title="Bookmark Exists" />
                <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
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

                            <Alert
                                icon={<IconAlertCircle size={16} />}
                                title="Bookmark Already Exists"
                                color="yellow"
                            >
                                This URL has already been bookmarked.
                            </Alert>

                            <Card withBorder p="lg">
                                <Stack gap="md">
                                    <Text fw={500}>
                                        {existingBookmark.title}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        {existingBookmark.url}
                                    </Text>
                                    {existingBookmark.description && (
                                        <Text size="sm">
                                            {existingBookmark.description}
                                        </Text>
                                    )}
                                    <Group>
                                        <Button
                                            component={Link}
                                            href={`/admin/bookmarks/${existingBookmark.short_url}/edit`}
                                        >
                                            Edit Bookmark
                                        </Button>
                                        <Button
                                            component="a"
                                            href={existingBookmark.url}
                                            target="_blank"
                                            variant="light"
                                        >
                                            Visit URL
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

    return (
        <>
            <Head title="Add Bookmark" />
            <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
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

                        <Title order={1}>Add Bookmark</Title>

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
                                    <Button type="submit" loading={processing}>
                                        Save Bookmark
                                    </Button>
                                </Stack>
                            </form>
                        </Card>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

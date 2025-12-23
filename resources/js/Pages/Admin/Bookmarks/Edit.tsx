import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    Box,
    Button,
    Card,
    Container,
    Group,
    Stack,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
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

                        <Title order={1}>Edit Bookmark</Title>

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

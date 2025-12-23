import { Head, Link, router } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    Card,
    Container,
    FileInput,
    Group,
    Progress,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconArrowLeft,
    IconCheck,
    IconUpload,
} from '@tabler/icons-react';
import { useState } from 'react';
import type { PageProps } from '@/types';

interface ImportResult {
    imported: number;
    skipped: number;
    errors: string[];
}

interface Props extends PageProps {
    result?: ImportResult;
}

export default function Import({ result }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        router.post(
            '/admin/import',
            { file },
            {
                forceFormData: true,
                onStart: () => setProcessing(true),
                onFinish: () => {
                    setProcessing(false);
                    setProgress(null);
                },
                onProgress: (event) => {
                    if (event?.percentage) {
                        setProgress(event.percentage);
                    }
                },
            },
        );
    };

    return (
        <>
            <Head title="Import Bookmarks" />
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

                        <Title order={1}>Import Bookmarks</Title>

                        <Text c="dimmed">
                            Import bookmarks from a Shaarli HTML export file
                            (Netscape bookmark format).
                        </Text>

                        {result && (
                            <Alert
                                icon={
                                    result.errors.length > 0 ? (
                                        <IconAlertCircle size={16} />
                                    ) : (
                                        <IconCheck size={16} />
                                    )
                                }
                                color={
                                    result.errors.length > 0
                                        ? 'yellow'
                                        : 'green'
                                }
                                title="Import Complete"
                            >
                                <Stack gap="xs">
                                    <Text size="sm">
                                        Successfully imported {result.imported}{' '}
                                        bookmarks.
                                        {result.skipped > 0 &&
                                            ` Skipped ${result.skipped} duplicates.`}
                                    </Text>
                                    {result.errors.length > 0 && (
                                        <Text size="sm" c="red">
                                            {result.errors.length} errors
                                            occurred during import.
                                        </Text>
                                    )}
                                </Stack>
                            </Alert>
                        )}

                        <Card withBorder p="xl">
                            <form onSubmit={handleSubmit}>
                                <Stack gap="md">
                                    <FileInput
                                        label="Shaarli Export File"
                                        description="Select an HTML file exported from Shaarli"
                                        placeholder="Click to select file"
                                        accept=".html,.htm"
                                        value={file}
                                        onChange={setFile}
                                        leftSection={<IconUpload size={16} />}
                                        required
                                    />

                                    {progress !== null && (
                                        <Progress value={progress} animated />
                                    )}

                                    <Button
                                        type="submit"
                                        loading={processing}
                                        disabled={!file}
                                        leftSection={<IconUpload size={16} />}
                                    >
                                        Import Bookmarks
                                    </Button>
                                </Stack>
                            </form>
                        </Card>

                        <Card withBorder p="lg">
                            <Stack gap="sm">
                                <Title order={4}>
                                    How to export from Shaarli
                                </Title>
                                <Text size="sm" c="dimmed">
                                    1. Go to your Shaarli instance
                                    <br />
                                    2. Navigate to Tools → Export
                                    <br />
                                    3. Select "Export all" and click "Export"
                                    <br />
                                    4. Save the HTML file and upload it here
                                </Text>
                            </Stack>
                        </Card>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

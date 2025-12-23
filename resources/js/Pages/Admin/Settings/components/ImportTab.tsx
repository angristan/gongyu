import { router } from '@inertiajs/react';
import {
    Alert,
    Button,
    Card,
    FileInput,
    Progress,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconUpload } from '@tabler/icons-react';
import { useState } from 'react';

interface ImportResult {
    imported: number;
    skipped: number;
    errors: string[];
}

interface Props {
    importResult?: ImportResult;
}

export function ImportTab({ importResult }: Props) {
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importProcessing, setImportProcessing] = useState(false);
    const [importProgress, setImportProgress] = useState<number | null>(null);

    const handleImportSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!importFile) return;

        router.post(
            '/admin/import',
            { file: importFile },
            {
                forceFormData: true,
                onStart: () => setImportProcessing(true),
                onFinish: () => {
                    setImportProcessing(false);
                    setImportProgress(null);
                },
                onProgress: (event) => {
                    if (event?.percentage) {
                        setImportProgress(event.percentage);
                    }
                },
            },
        );
    };

    return (
        <Stack gap="md">
            {importResult && (
                <Alert
                    icon={
                        importResult.errors.length > 0 ? (
                            <IconAlertCircle size={16} />
                        ) : (
                            <IconCheck size={16} />
                        )
                    }
                    color={importResult.errors.length > 0 ? 'yellow' : 'green'}
                    title="Import Complete"
                >
                    <Stack gap="xs">
                        <Text size="sm">
                            Successfully imported {importResult.imported}{' '}
                            bookmarks.
                            {importResult.skipped > 0 &&
                                ` Skipped ${importResult.skipped} duplicates.`}
                        </Text>
                        {importResult.errors.length > 0 && (
                            <Text size="sm" c="red">
                                {importResult.errors.length} errors occurred
                                during import.
                            </Text>
                        )}
                    </Stack>
                </Alert>
            )}

            <Card withBorder p="xl">
                <form onSubmit={handleImportSubmit}>
                    <Stack gap="md">
                        <Title order={3}>Import from Shaarli</Title>
                        <Text size="sm" c="dimmed">
                            Import bookmarks from a Shaarli HTML export file
                            (Netscape bookmark format).
                        </Text>

                        <FileInput
                            label="Shaarli Export File"
                            description="Select an HTML file exported from Shaarli"
                            placeholder="Click to select file"
                            accept=".html,.htm"
                            value={importFile}
                            onChange={setImportFile}
                            leftSection={<IconUpload size={16} />}
                        />

                        {importProgress !== null && (
                            <Progress value={importProgress} animated />
                        )}

                        <Button
                            type="submit"
                            loading={importProcessing}
                            disabled={!importFile}
                            leftSection={<IconUpload size={16} />}
                        >
                            Import Bookmarks
                        </Button>
                    </Stack>
                </form>
            </Card>

            <Card withBorder p="lg">
                <Stack gap="sm">
                    <Title order={4}>How to export from Shaarli</Title>
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
    );
}

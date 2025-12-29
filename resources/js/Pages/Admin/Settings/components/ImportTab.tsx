import { router } from '@inertiajs/react';
import {
    Alert,
    Badge,
    Button,
    Card,
    FileInput,
    Group,
    PasswordInput,
    Progress,
    SegmentedControl,
    Stack,
    Tabs,
    Text,
    TextInput,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconCheck,
    IconCloud,
    IconDatabase,
    IconFileText,
    IconJson,
    IconRefresh,
    IconUpload,
} from '@tabler/icons-react';
import { useState } from 'react';

interface ImportResult {
    imported: number;
    skipped: number;
    errors: string[];
}

interface Props {
    importResult?: ImportResult;
}

type ShaarliImportType = 'html' | 'datastore' | 'api';

export function ImportTab({ importResult }: Props) {
    const [importProcessing, setImportProcessing] = useState(false);
    const [importProgress, setImportProgress] = useState<number | null>(null);

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
                        {importResult.errors.map((error) => (
                            <Text key={error} size="sm" c="red">
                                {error}
                            </Text>
                        ))}
                    </Stack>
                </Alert>
            )}

            <Card withBorder p="xl">
                <Tabs defaultValue="shaarli">
                    <Tabs.List>
                        <Tabs.Tab
                            value="shaarli"
                            leftSection={<IconDatabase size={16} />}
                        >
                            Import from Shaarli
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="gongyu"
                            leftSection={<IconRefresh size={16} />}
                        >
                            Restore from Backup
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="shaarli" pt="md">
                        <ShaarliImportPanel
                            importProcessing={importProcessing}
                            setImportProcessing={setImportProcessing}
                            importProgress={importProgress}
                            setImportProgress={setImportProgress}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="gongyu" pt="md">
                        <GongyuImportPanel
                            importProcessing={importProcessing}
                            setImportProcessing={setImportProcessing}
                            importProgress={importProgress}
                            setImportProgress={setImportProgress}
                        />
                    </Tabs.Panel>
                </Tabs>
            </Card>
        </Stack>
    );
}

function ShaarliImportPanel({
    importProcessing,
    setImportProcessing,
    importProgress,
    setImportProgress,
}: {
    importProcessing: boolean;
    setImportProcessing: (v: boolean) => void;
    importProgress: number | null;
    setImportProgress: (v: number | null) => void;
}) {
    const [importType, setImportType] = useState<ShaarliImportType>('api');
    const [importFile, setImportFile] = useState<File | null>(null);
    const [shaarliUrl, setShaarliUrl] = useState('');
    const [apiSecret, setApiSecret] = useState('');

    const handleImportSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (importType === 'api') {
            router.post(
                '/admin/import',
                {
                    import_type: importType,
                    shaarli_url: shaarliUrl,
                    api_secret: apiSecret,
                },
                {
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
            return;
        }

        if (!importFile) return;

        router.post(
            '/admin/import',
            { import_type: importType, file: importFile },
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

    const canSubmit = () => {
        if (importType === 'api') {
            return shaarliUrl.length > 0 && apiSecret.length >= 12;
        }
        return importFile !== null;
    };

    return (
        <Stack gap="md">
            <form onSubmit={handleImportSubmit}>
                <Stack gap="md">
                    <SegmentedControl
                        value={importType}
                        onChange={(v) => {
                            setImportType(v as ShaarliImportType);
                            // Reset form fields when switching import method
                            setImportFile(null);
                            setShaarliUrl('');
                            setApiSecret('');
                        }}
                        data={[
                            {
                                value: 'api',
                                label: (
                                    <Group gap="xs">
                                        <IconCloud size={16} />
                                        <span>API</span>
                                    </Group>
                                ),
                            },
                            {
                                value: 'datastore',
                                label: (
                                    <Group gap="xs">
                                        <IconDatabase size={16} />
                                        <span>Database File</span>
                                    </Group>
                                ),
                            },
                            {
                                value: 'html',
                                label: (
                                    <Group gap="xs">
                                        <IconFileText size={16} />
                                        <span>HTML Export</span>
                                    </Group>
                                ),
                            },
                        ]}
                    />

                    {importType === 'html' && (
                        <>
                            <Text size="sm" c="dimmed">
                                Upload your Shaarli HTML export file (Netscape
                                bookmark format).
                            </Text>
                            <Alert
                                color="yellow"
                                variant="light"
                                icon={<IconAlertCircle size={16} />}
                            >
                                Legacy URLs (/shaare/xxx) won't be preserved
                                with HTML import. Use Database or API import for
                                full migration.
                            </Alert>
                            <FileInput
                                label="Shaarli Export File"
                                description="Select an HTML file exported from Shaarli"
                                placeholder="Click to select file"
                                accept=".html,.htm"
                                value={importFile}
                                onChange={setImportFile}
                                leftSection={<IconUpload size={16} />}
                            />
                        </>
                    )}

                    {importType === 'datastore' && (
                        <>
                            <Group gap="xs">
                                <Text size="sm" c="dimmed">
                                    Upload your Shaarli datastore.php file.
                                </Text>
                                <Badge color="green" size="sm">
                                    Preserves legacy URLs
                                </Badge>
                            </Group>
                            <Text size="xs" c="dimmed">
                                Location: data/datastore.php in your Shaarli
                                folder.
                            </Text>
                            <FileInput
                                label="Datastore File"
                                description="Select the datastore.php file from your Shaarli installation"
                                placeholder="Click to select file"
                                accept=".php"
                                value={importFile}
                                onChange={setImportFile}
                                leftSection={<IconDatabase size={16} />}
                            />
                        </>
                    )}

                    {importType === 'api' && (
                        <>
                            <Group gap="xs">
                                <Text size="sm" c="dimmed">
                                    Import directly from a running Shaarli
                                    instance.
                                </Text>
                                <Badge color="green" size="sm">
                                    Preserves legacy URLs
                                </Badge>
                            </Group>
                            <TextInput
                                label="Shaarli URL"
                                description="The base URL of your Shaarli instance"
                                placeholder="https://links.example.com"
                                value={shaarliUrl}
                                onChange={(e) => setShaarliUrl(e.target.value)}
                            />
                            <PasswordInput
                                label="API Secret"
                                description="Find in Tools → Configure your Shaarli → REST API"
                                placeholder="Your API secret"
                                value={apiSecret}
                                onChange={(e) => setApiSecret(e.target.value)}
                            />
                        </>
                    )}

                    {importProgress !== null && (
                        <Progress value={importProgress} animated />
                    )}

                    <Button
                        type="submit"
                        loading={importProcessing}
                        disabled={!canSubmit()}
                        leftSection={<IconUpload size={16} />}
                    >
                        Import Bookmarks
                    </Button>
                </Stack>
            </form>

            <Stack gap="xs" mt="md">
                <Text size="sm" fw={500}>
                    Import Methods
                </Text>
                <Text size="sm" c="dimmed">
                    <strong>API:</strong> Live import from a running Shaarli
                    instance. Requires API secret from Shaarli settings.
                    Preserves legacy URLs.
                </Text>
                <Text size="sm" c="dimmed">
                    <strong>Database File:</strong> Direct import from Shaarli's
                    datastore.php. Preserves all data including legacy URLs.
                </Text>
                <Text size="sm" c="dimmed">
                    <strong>HTML Export:</strong> Standard Netscape bookmark
                    format. Quick but doesn't preserve legacy Shaarli URLs.
                </Text>
            </Stack>
        </Stack>
    );
}

function GongyuImportPanel({
    importProcessing,
    setImportProcessing,
    importProgress,
    setImportProgress,
}: {
    importProcessing: boolean;
    setImportProcessing: (v: boolean) => void;
    importProgress: number | null;
    setImportProgress: (v: number | null) => void;
}) {
    const [gongyuFile, setGongyuFile] = useState<File | null>(null);

    const handleGongyuImport = (e: React.FormEvent) => {
        e.preventDefault();
        if (!gongyuFile) return;

        router.post(
            '/admin/import',
            { import_type: 'gongyu', file: gongyuFile },
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
            <Text size="sm" c="dimmed">
                Restore bookmarks from a Gongyu JSON export. This preserves all
                data including short URLs, Shaarli legacy URLs, and thumbnails.
            </Text>

            <form onSubmit={handleGongyuImport}>
                <Stack gap="md">
                    <FileInput
                        label="Gongyu Export File"
                        description="Select a JSON file exported from Gongyu"
                        placeholder="Click to select file"
                        accept=".json"
                        value={gongyuFile}
                        onChange={setGongyuFile}
                        leftSection={<IconJson size={16} />}
                    />

                    {importProgress !== null && (
                        <Progress value={importProgress} animated />
                    )}

                    <Button
                        type="submit"
                        loading={importProcessing}
                        disabled={!gongyuFile}
                        leftSection={<IconUpload size={16} />}
                    >
                        Restore Bookmarks
                    </Button>
                </Stack>
            </form>
        </Stack>
    );
}

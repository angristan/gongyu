import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    Card,
    Container,
    FileInput,
    Group,
    PasswordInput,
    Progress,
    Stack,
    Tabs,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconArrowLeft,
    IconBrandMastodon,
    IconBrandTwitter,
    IconCheck,
    IconCloud,
    IconHome,
    IconUpload,
} from '@tabler/icons-react';
import { useState } from 'react';
import type { PageProps } from '@/types';

const VALID_TABS = ['import', 'twitter', 'mastodon', 'bluesky'] as const;
type TabValue = (typeof VALID_TABS)[number];

interface Settings {
    twitter_api_key: string;
    twitter_api_secret: string;
    twitter_access_token: string;
    twitter_access_secret: string;
    mastodon_instance: string;
    mastodon_access_token: string;
    bluesky_handle: string;
    bluesky_app_password: string;
}

interface ImportResult {
    imported: number;
    skipped: number;
    errors: string[];
}

interface Props extends PageProps {
    settings: Settings;
    importResult?: ImportResult;
}

function getInitialTab(): TabValue {
    if (typeof window === 'undefined') return 'import';
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return tab && VALID_TABS.includes(tab as TabValue)
        ? (tab as TabValue)
        : 'import';
}

export default function SettingsIndex({ settings, importResult }: Props) {
    const [activeTab, setActiveTab] = useState<TabValue>(getInitialTab);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importProcessing, setImportProcessing] = useState(false);
    const [importProgress, setImportProgress] = useState<number | null>(null);

    const handleTabChange = (value: string | null) => {
        if (value && VALID_TABS.includes(value as TabValue)) {
            setActiveTab(value as TabValue);
            const url = new URL(window.location.href);
            url.searchParams.set('tab', value);
            window.history.replaceState({}, '', url.toString());
        }
    };

    const { data, setData, patch, processing, errors } = useForm({
        twitter_api_key: settings.twitter_api_key || '',
        twitter_api_secret: settings.twitter_api_secret || '',
        twitter_access_token: settings.twitter_access_token || '',
        twitter_access_secret: settings.twitter_access_secret || '',
        mastodon_instance: settings.mastodon_instance || '',
        mastodon_access_token: settings.mastodon_access_token || '',
        bluesky_handle: settings.bluesky_handle || '',
        bluesky_app_password: settings.bluesky_app_password || '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        patch('/admin/settings');
    };

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
        <>
            <Head title="Settings" />
            <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                <Container size="md">
                    <Stack gap="lg">
                        <Group>
                            <Button
                                component={Link}
                                href="/admin/dashboard"
                                variant="subtle"
                                leftSection={<IconArrowLeft size={16} />}
                            >
                                Dashboard
                            </Button>
                            <Button
                                component={Link}
                                href="/"
                                variant="default"
                                leftSection={<IconHome size={16} />}
                            >
                                View Site
                            </Button>
                        </Group>

                        <Title order={1}>Settings</Title>

                        <Tabs value={activeTab} onChange={handleTabChange}>
                            <Tabs.List>
                                <Tabs.Tab
                                    value="import"
                                    leftSection={<IconUpload size={16} />}
                                >
                                    Import
                                </Tabs.Tab>
                                <Tabs.Tab
                                    value="twitter"
                                    leftSection={<IconBrandTwitter size={16} />}
                                >
                                    Twitter
                                </Tabs.Tab>
                                <Tabs.Tab
                                    value="mastodon"
                                    leftSection={
                                        <IconBrandMastodon size={16} />
                                    }
                                >
                                    Mastodon
                                </Tabs.Tab>
                                <Tabs.Tab
                                    value="bluesky"
                                    leftSection={<IconCloud size={16} />}
                                >
                                    Bluesky
                                </Tabs.Tab>
                            </Tabs.List>

                            <Tabs.Panel value="import" pt="md">
                                <Stack gap="md">
                                    {importResult && (
                                        <Alert
                                            icon={
                                                importResult.errors.length >
                                                0 ? (
                                                    <IconAlertCircle
                                                        size={16}
                                                    />
                                                ) : (
                                                    <IconCheck size={16} />
                                                )
                                            }
                                            color={
                                                importResult.errors.length > 0
                                                    ? 'yellow'
                                                    : 'green'
                                            }
                                            title="Import Complete"
                                        >
                                            <Stack gap="xs">
                                                <Text size="sm">
                                                    Successfully imported{' '}
                                                    {importResult.imported}{' '}
                                                    bookmarks.
                                                    {importResult.skipped > 0 &&
                                                        ` Skipped ${importResult.skipped} duplicates.`}
                                                </Text>
                                                {importResult.errors.length >
                                                    0 && (
                                                    <Text size="sm" c="red">
                                                        {
                                                            importResult.errors
                                                                .length
                                                        }{' '}
                                                        errors occurred during
                                                        import.
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Alert>
                                    )}

                                    <Card withBorder p="xl">
                                        <form onSubmit={handleImportSubmit}>
                                            <Stack gap="md">
                                                <Title order={3}>
                                                    Import from Shaarli
                                                </Title>
                                                <Text size="sm" c="dimmed">
                                                    Import bookmarks from a
                                                    Shaarli HTML export file
                                                    (Netscape bookmark format).
                                                </Text>

                                                <FileInput
                                                    label="Shaarli Export File"
                                                    description="Select an HTML file exported from Shaarli"
                                                    placeholder="Click to select file"
                                                    accept=".html,.htm"
                                                    value={importFile}
                                                    onChange={setImportFile}
                                                    leftSection={
                                                        <IconUpload size={16} />
                                                    }
                                                />

                                                {importProgress !== null && (
                                                    <Progress
                                                        value={importProgress}
                                                        animated
                                                    />
                                                )}

                                                <Button
                                                    type="submit"
                                                    loading={importProcessing}
                                                    disabled={!importFile}
                                                    leftSection={
                                                        <IconUpload size={16} />
                                                    }
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
                                                3. Select "Export all" and click
                                                "Export"
                                                <br />
                                                4. Save the HTML file and upload
                                                it here
                                            </Text>
                                        </Stack>
                                    </Card>
                                </Stack>
                            </Tabs.Panel>

                            <Tabs.Panel value="twitter" pt="md">
                                <Stack gap="md">
                                    <form onSubmit={handleSubmit}>
                                        <Card withBorder p="xl">
                                            <Stack gap="md">
                                                <Title order={3}>
                                                    Twitter API
                                                </Title>
                                                <Text size="sm" c="dimmed">
                                                    Configure Twitter API
                                                    credentials to auto-share
                                                    bookmarks to Twitter.
                                                </Text>

                                                <TextInput
                                                    label="API Key"
                                                    placeholder="Enter your Twitter API key"
                                                    value={data.twitter_api_key}
                                                    onChange={(e) =>
                                                        setData(
                                                            'twitter_api_key',
                                                            e.target.value,
                                                        )
                                                    }
                                                    error={
                                                        errors.twitter_api_key
                                                    }
                                                />
                                                <PasswordInput
                                                    label="API Secret"
                                                    placeholder="Enter your Twitter API secret"
                                                    value={
                                                        data.twitter_api_secret
                                                    }
                                                    onChange={(e) =>
                                                        setData(
                                                            'twitter_api_secret',
                                                            e.target.value,
                                                        )
                                                    }
                                                    error={
                                                        errors.twitter_api_secret
                                                    }
                                                />
                                                <TextInput
                                                    label="Access Token"
                                                    placeholder="Enter your Twitter access token"
                                                    value={
                                                        data.twitter_access_token
                                                    }
                                                    onChange={(e) =>
                                                        setData(
                                                            'twitter_access_token',
                                                            e.target.value,
                                                        )
                                                    }
                                                    error={
                                                        errors.twitter_access_token
                                                    }
                                                />
                                                <PasswordInput
                                                    label="Access Token Secret"
                                                    placeholder="Enter your Twitter access token secret"
                                                    value={
                                                        data.twitter_access_secret
                                                    }
                                                    onChange={(e) =>
                                                        setData(
                                                            'twitter_access_secret',
                                                            e.target.value,
                                                        )
                                                    }
                                                    error={
                                                        errors.twitter_access_secret
                                                    }
                                                />

                                                <Button
                                                    type="submit"
                                                    loading={processing}
                                                >
                                                    Save Twitter Settings
                                                </Button>
                                            </Stack>
                                        </Card>
                                    </form>

                                    <Card withBorder p="lg">
                                        <Stack gap="sm">
                                            <Title order={4}>
                                                How to get Twitter API
                                                credentials
                                            </Title>
                                            <Text size="sm" c="dimmed">
                                                1. Go to the Twitter Developer
                                                Portal (developer.twitter.com)
                                                <br />
                                                2. Create a new project and app
                                                <br />
                                                3. Set up User Authentication
                                                with Read and Write permissions
                                                <br />
                                                4. Generate API Key, API Secret,
                                                Access Token, and Access Token
                                                Secret
                                                <br />
                                                5. Copy all four values here
                                            </Text>
                                        </Stack>
                                    </Card>
                                </Stack>
                            </Tabs.Panel>

                            <Tabs.Panel value="mastodon" pt="md">
                                <Stack gap="md">
                                    <form onSubmit={handleSubmit}>
                                        <Card withBorder p="xl">
                                            <Stack gap="md">
                                                <Title order={3}>
                                                    Mastodon
                                                </Title>
                                                <Text size="sm" c="dimmed">
                                                    Configure Mastodon
                                                    credentials to auto-share
                                                    bookmarks to your Mastodon
                                                    instance.
                                                </Text>

                                                <TextInput
                                                    label="Instance URL"
                                                    placeholder="https://mastodon.social"
                                                    value={
                                                        data.mastodon_instance
                                                    }
                                                    onChange={(e) =>
                                                        setData(
                                                            'mastodon_instance',
                                                            e.target.value,
                                                        )
                                                    }
                                                    error={
                                                        errors.mastodon_instance
                                                    }
                                                />
                                                <PasswordInput
                                                    label="Access Token"
                                                    placeholder="Enter your Mastodon access token"
                                                    value={
                                                        data.mastodon_access_token
                                                    }
                                                    onChange={(e) =>
                                                        setData(
                                                            'mastodon_access_token',
                                                            e.target.value,
                                                        )
                                                    }
                                                    error={
                                                        errors.mastodon_access_token
                                                    }
                                                />

                                                <Button
                                                    type="submit"
                                                    loading={processing}
                                                >
                                                    Save Mastodon Settings
                                                </Button>
                                            </Stack>
                                        </Card>
                                    </form>

                                    <Card withBorder p="lg">
                                        <Stack gap="sm">
                                            <Title order={4}>
                                                How to get a Mastodon access
                                                token
                                            </Title>
                                            <Text size="sm" c="dimmed">
                                                1. Log in to your Mastodon
                                                instance
                                                <br />
                                                2. Go to Settings → Development
                                                <br />
                                                3. Click "New Application"
                                                <br />
                                                4. Enter a name (e.g., "Gongyu")
                                                and select "write:statuses"
                                                scope
                                                <br />
                                                5. Submit and copy the access
                                                token
                                            </Text>
                                        </Stack>
                                    </Card>
                                </Stack>
                            </Tabs.Panel>

                            <Tabs.Panel value="bluesky" pt="md">
                                <Stack gap="md">
                                    <form onSubmit={handleSubmit}>
                                        <Card withBorder p="xl">
                                            <Stack gap="md">
                                                <Title order={3}>Bluesky</Title>
                                                <Text size="sm" c="dimmed">
                                                    Configure Bluesky
                                                    credentials to auto-share
                                                    bookmarks to Bluesky.
                                                </Text>

                                                <TextInput
                                                    label="Handle"
                                                    placeholder="yourname.bsky.social"
                                                    value={data.bluesky_handle}
                                                    onChange={(e) =>
                                                        setData(
                                                            'bluesky_handle',
                                                            e.target.value,
                                                        )
                                                    }
                                                    error={
                                                        errors.bluesky_handle
                                                    }
                                                />
                                                <PasswordInput
                                                    label="App Password"
                                                    placeholder="Enter your Bluesky app password"
                                                    value={
                                                        data.bluesky_app_password
                                                    }
                                                    onChange={(e) =>
                                                        setData(
                                                            'bluesky_app_password',
                                                            e.target.value,
                                                        )
                                                    }
                                                    error={
                                                        errors.bluesky_app_password
                                                    }
                                                />

                                                <Button
                                                    type="submit"
                                                    loading={processing}
                                                >
                                                    Save Bluesky Settings
                                                </Button>
                                            </Stack>
                                        </Card>
                                    </form>

                                    <Card withBorder p="lg">
                                        <Stack gap="sm">
                                            <Title order={4}>
                                                How to get a Bluesky app
                                                password
                                            </Title>
                                            <Text size="sm" c="dimmed">
                                                1. Log in to Bluesky (bsky.app)
                                                <br />
                                                2. Go to Settings → Privacy and
                                                Security → App Passwords
                                                <br />
                                                3. Click "Add App Password"
                                                <br />
                                                4. Enter a name (e.g., "Gongyu")
                                                <br />
                                                5. Copy the generated password
                                                (you won't be able to see it
                                                again)
                                            </Text>
                                        </Stack>
                                    </Card>
                                </Stack>
                            </Tabs.Panel>
                        </Tabs>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

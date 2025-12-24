import { Head, Link, useForm } from '@inertiajs/react';
import {
    Box,
    Button,
    Container,
    Group,
    Stack,
    Tabs,
    Title,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconBrandMastodon,
    IconBrandTwitter,
    IconCloud,
    IconHome,
    IconUpload,
} from '@tabler/icons-react';
import { useState } from 'react';
import type { PageProps } from '@/types';
import {
    BlueskySettingsTab,
    ImportTab,
    MastodonSettingsTab,
    TwitterSettingsTab,
} from './components';

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

    return (
        <>
            <Head title="Settings" />
            <Box className="cozy-background" mih="100vh" py="xl">
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

                        <Title order={1} className="cozy-title">
                            Settings
                        </Title>

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
                                <ImportTab importResult={importResult} />
                            </Tabs.Panel>

                            <Tabs.Panel value="twitter" pt="md">
                                <TwitterSettingsTab
                                    data={data}
                                    setData={setData}
                                    errors={errors}
                                    processing={processing}
                                    onSubmit={handleSubmit}
                                />
                            </Tabs.Panel>

                            <Tabs.Panel value="mastodon" pt="md">
                                <MastodonSettingsTab
                                    data={data}
                                    setData={setData}
                                    errors={errors}
                                    processing={processing}
                                    onSubmit={handleSubmit}
                                />
                            </Tabs.Panel>

                            <Tabs.Panel value="bluesky" pt="md">
                                <BlueskySettingsTab
                                    data={data}
                                    setData={setData}
                                    errors={errors}
                                    processing={processing}
                                    onSubmit={handleSubmit}
                                />
                            </Tabs.Panel>
                        </Tabs>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

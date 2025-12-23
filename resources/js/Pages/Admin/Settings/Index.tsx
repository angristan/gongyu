import { Head, Link, useForm } from '@inertiajs/react';
import {
    ActionIcon,
    Box,
    Button,
    Card,
    Code,
    Container,
    CopyButton,
    Group,
    PasswordInput,
    Stack,
    Tabs,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconBrandMastodon,
    IconBrandTwitter,
    IconCheck,
    IconCloud,
    IconCode,
    IconCopy,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import type { PageProps } from '@/types';

const VALID_TABS = ['bookmarklet', 'twitter', 'mastodon', 'bluesky'] as const;
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

interface Props extends PageProps {
    settings: Settings;
    bookmarkletUrl: string;
}

function getInitialTab(): TabValue {
    if (typeof window === 'undefined') return 'bookmarklet';
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return tab && VALID_TABS.includes(tab as TabValue)
        ? (tab as TabValue)
        : 'bookmarklet';
}

export default function SettingsIndex({ settings, bookmarkletUrl }: Props) {
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

    const bookmarkletCode = `javascript:(function(){window.open('${bookmarkletUrl}?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&description='+encodeURIComponent(window.getSelection())+'&source=bookmarklet','gongyu','width=600,height=500');})();`;

    const bookmarkletRef = useRef<HTMLAnchorElement>(null);

    useEffect(() => {
        if (bookmarkletRef.current) {
            bookmarkletRef.current.setAttribute('href', bookmarkletCode);
        }
    }, [bookmarkletCode]);

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
                        </Group>

                        <Title order={1}>Settings</Title>

                        <Tabs value={activeTab} onChange={handleTabChange}>
                            <Tabs.List>
                                <Tabs.Tab
                                    value="bookmarklet"
                                    leftSection={<IconCode size={16} />}
                                >
                                    Bookmarklet
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

                            <Tabs.Panel value="bookmarklet" pt="md">
                                <Card withBorder p="xl">
                                    <Stack gap="md">
                                        <Title order={3}>Bookmarklet</Title>
                                        <Text size="sm" c="dimmed">
                                            Drag the button below to your
                                            bookmarks bar, or copy the code to
                                            create a bookmarklet manually.
                                        </Text>

                                        <Group>
                                            <a
                                                ref={bookmarkletRef}
                                                onClick={(e) =>
                                                    e.preventDefault()
                                                }
                                                draggable
                                                style={{
                                                    padding: '8px 16px',
                                                    borderRadius:
                                                        'var(--mantine-radius-default)',
                                                    backgroundColor:
                                                        'var(--mantine-color-blue-filled)',
                                                    color: 'white',
                                                    textDecoration: 'none',
                                                    fontSize:
                                                        'var(--mantine-font-size-sm)',
                                                    fontWeight: 600,
                                                    cursor: 'grab',
                                                }}
                                            >
                                                + Add to Gongyu
                                            </a>
                                            <Text size="sm" c="dimmed">
                                                ← Drag this to your bookmarks
                                                bar
                                            </Text>
                                        </Group>

                                        <Stack gap="xs">
                                            <Group justify="space-between">
                                                <Text size="sm" fw={500}>
                                                    Bookmarklet Code
                                                </Text>
                                                <CopyButton
                                                    value={bookmarkletCode}
                                                >
                                                    {({ copied, copy }) => (
                                                        <Tooltip
                                                            label={
                                                                copied
                                                                    ? 'Copied'
                                                                    : 'Copy'
                                                            }
                                                        >
                                                            <ActionIcon
                                                                variant="subtle"
                                                                onClick={copy}
                                                            >
                                                                {copied ? (
                                                                    <IconCheck
                                                                        size={
                                                                            16
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <IconCopy
                                                                        size={
                                                                            16
                                                                        }
                                                                    />
                                                                )}
                                                            </ActionIcon>
                                                        </Tooltip>
                                                    )}
                                                </CopyButton>
                                            </Group>
                                            <Code
                                                block
                                                style={{
                                                    wordBreak: 'break-all',
                                                }}
                                            >
                                                {bookmarkletCode}
                                            </Code>
                                        </Stack>
                                    </Stack>
                                </Card>
                            </Tabs.Panel>

                            <Tabs.Panel value="twitter" pt="md">
                                <form onSubmit={handleSubmit}>
                                    <Card withBorder p="xl">
                                        <Stack gap="md">
                                            <Title order={3}>Twitter API</Title>
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
                                                error={errors.twitter_api_key}
                                            />
                                            <PasswordInput
                                                label="API Secret"
                                                placeholder="Enter your Twitter API secret"
                                                value={data.twitter_api_secret}
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
                            </Tabs.Panel>

                            <Tabs.Panel value="mastodon" pt="md">
                                <form onSubmit={handleSubmit}>
                                    <Card withBorder p="xl">
                                        <Stack gap="md">
                                            <Title order={3}>Mastodon</Title>
                                            <Text size="sm" c="dimmed">
                                                Configure Mastodon credentials
                                                to auto-share bookmarks to your
                                                Mastodon instance.
                                            </Text>

                                            <TextInput
                                                label="Instance URL"
                                                placeholder="https://mastodon.social"
                                                value={data.mastodon_instance}
                                                onChange={(e) =>
                                                    setData(
                                                        'mastodon_instance',
                                                        e.target.value,
                                                    )
                                                }
                                                error={errors.mastodon_instance}
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
                            </Tabs.Panel>

                            <Tabs.Panel value="bluesky" pt="md">
                                <form onSubmit={handleSubmit}>
                                    <Card withBorder p="xl">
                                        <Stack gap="md">
                                            <Title order={3}>Bluesky</Title>
                                            <Text size="sm" c="dimmed">
                                                Configure Bluesky credentials to
                                                auto-share bookmarks to Bluesky.
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
                                                error={errors.bluesky_handle}
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
                            </Tabs.Panel>
                        </Tabs>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

import {
    Button,
    Card,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';

interface Props {
    data: {
        mastodon_instance: string;
        mastodon_access_token: string;
    };
    setData: (key: string, value: string) => void;
    errors: Record<string, string>;
    processing: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

export function MastodonSettingsTab({
    data,
    setData,
    errors,
    processing,
    onSubmit,
}: Props) {
    return (
        <Stack gap="md">
            <form onSubmit={onSubmit}>
                <Card withBorder p="xl">
                    <Stack gap="md">
                        <Title order={3}>Mastodon</Title>
                        <Text size="sm" c="dimmed">
                            Configure Mastodon credentials to auto-share
                            bookmarks to your Mastodon instance.
                        </Text>

                        <TextInput
                            label="Instance URL"
                            placeholder="https://mastodon.social"
                            value={data.mastodon_instance}
                            onChange={(e) =>
                                setData('mastodon_instance', e.target.value)
                            }
                            error={errors.mastodon_instance}
                        />
                        <PasswordInput
                            label="Access Token"
                            placeholder="Enter your Mastodon access token"
                            value={data.mastodon_access_token}
                            onChange={(e) =>
                                setData('mastodon_access_token', e.target.value)
                            }
                            error={errors.mastodon_access_token}
                        />

                        <Button type="submit" loading={processing}>
                            Save Mastodon Settings
                        </Button>
                    </Stack>
                </Card>
            </form>

            <Card withBorder p="lg">
                <Stack gap="sm">
                    <Title order={4}>How to get a Mastodon access token</Title>
                    <Text size="sm" c="dimmed">
                        1. Log in to your Mastodon instance
                        <br />
                        2. Go to Settings → Development
                        <br />
                        3. Click "New Application"
                        <br />
                        4. Enter a name (e.g., "Gongyu") and select
                        "write:statuses" scope
                        <br />
                        5. Submit and copy the access token
                    </Text>
                </Stack>
            </Card>
        </Stack>
    );
}

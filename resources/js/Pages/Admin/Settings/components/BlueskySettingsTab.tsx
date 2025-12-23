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
        bluesky_handle: string;
        bluesky_app_password: string;
    };
    setData: (key: string, value: string) => void;
    errors: Record<string, string>;
    processing: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

export function BlueskySettingsTab({
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
                        <Title order={3}>Bluesky</Title>
                        <Text size="sm" c="dimmed">
                            Configure Bluesky credentials to auto-share
                            bookmarks to Bluesky.
                        </Text>

                        <TextInput
                            label="Handle"
                            placeholder="yourname.bsky.social"
                            value={data.bluesky_handle}
                            onChange={(e) =>
                                setData('bluesky_handle', e.target.value)
                            }
                            error={errors.bluesky_handle}
                        />
                        <PasswordInput
                            label="App Password"
                            placeholder="Enter your Bluesky app password"
                            value={data.bluesky_app_password}
                            onChange={(e) =>
                                setData('bluesky_app_password', e.target.value)
                            }
                            error={errors.bluesky_app_password}
                        />

                        <Button type="submit" loading={processing}>
                            Save Bluesky Settings
                        </Button>
                    </Stack>
                </Card>
            </form>

            <Card withBorder p="lg">
                <Stack gap="sm">
                    <Title order={4}>How to get a Bluesky app password</Title>
                    <Text size="sm" c="dimmed">
                        1. Log in to Bluesky (bsky.app)
                        <br />
                        2. Go to Settings → Privacy and Security → App Passwords
                        <br />
                        3. Click "Add App Password"
                        <br />
                        4. Enter a name (e.g., "Gongyu")
                        <br />
                        5. Copy the generated password (you won't be able to see
                        it again)
                    </Text>
                </Stack>
            </Card>
        </Stack>
    );
}

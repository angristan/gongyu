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
        twitter_api_key: string;
        twitter_api_secret: string;
        twitter_access_token: string;
        twitter_access_secret: string;
    };
    setData: (key: string, value: string) => void;
    errors: Record<string, string>;
    processing: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

export function TwitterSettingsTab({
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
                        <Title order={3}>Twitter API</Title>
                        <Text size="sm" c="dimmed">
                            Configure Twitter API credentials to auto-share
                            bookmarks to Twitter.
                        </Text>

                        <TextInput
                            label="API Key"
                            placeholder="Enter your Twitter API key"
                            value={data.twitter_api_key}
                            onChange={(e) =>
                                setData('twitter_api_key', e.target.value)
                            }
                            error={errors.twitter_api_key}
                        />
                        <PasswordInput
                            label="API Secret"
                            placeholder="Enter your Twitter API secret"
                            value={data.twitter_api_secret}
                            onChange={(e) =>
                                setData('twitter_api_secret', e.target.value)
                            }
                            error={errors.twitter_api_secret}
                        />
                        <TextInput
                            label="Access Token"
                            placeholder="Enter your Twitter access token"
                            value={data.twitter_access_token}
                            onChange={(e) =>
                                setData('twitter_access_token', e.target.value)
                            }
                            error={errors.twitter_access_token}
                        />
                        <PasswordInput
                            label="Access Token Secret"
                            placeholder="Enter your Twitter access token secret"
                            value={data.twitter_access_secret}
                            onChange={(e) =>
                                setData('twitter_access_secret', e.target.value)
                            }
                            error={errors.twitter_access_secret}
                        />

                        <Button type="submit" loading={processing}>
                            Save Twitter Settings
                        </Button>
                    </Stack>
                </Card>
            </form>

            <Card withBorder p="lg">
                <Stack gap="sm">
                    <Title order={4}>How to get Twitter API credentials</Title>
                    <Text size="sm" c="dimmed">
                        1. Go to the Twitter Developer Portal
                        (developer.twitter.com)
                        <br />
                        2. Create a new project and app
                        <br />
                        3. Set up User Authentication with Read and Write
                        permissions
                        <br />
                        4. Generate API Key, API Secret, Access Token, and
                        Access Token Secret
                        <br />
                        5. Copy all four values here
                    </Text>
                </Stack>
            </Card>
        </Stack>
    );
}

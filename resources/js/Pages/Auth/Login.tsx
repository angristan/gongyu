import { Head, useForm } from '@inertiajs/react';
import {
    Anchor,
    Box,
    Button,
    Card,
    Checkbox,
    Container,
    Group,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';

interface Props {
    quickLoginHosts: string[];
}

function matchesHost(hostname: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
        if (pattern.includes('*')) {
            const escaped = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
            const regex = new RegExp(`^${escaped}$`);
            return regex.test(hostname);
        }
        return pattern === hostname;
    });
}

export default function Login({ quickLoginHosts }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const showQuickLogin = matchesHost(window.location.hostname, quickLoginHosts);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/login');
    };

    const handleQuickLogin = (e: React.MouseEvent) => {
        e.preventDefault();
        post('/laravel-login-link-login');
    };

    return (
        <>
            <Head title="Login" />
            <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                <Container size="xs">
                    <Stack gap="lg">
                        <Stack gap="xs" ta="center">
                            <Title order={1}>Gongyu</Title>
                            <Text c="dimmed">Sign in to your account</Text>
                        </Stack>

                        <Card withBorder p="xl">
                            <form onSubmit={handleSubmit}>
                                <Stack gap="md">
                                    <TextInput
                                        label="Email"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={data.email}
                                        onChange={(e) =>
                                            setData('email', e.target.value)
                                        }
                                        error={errors.email}
                                        required
                                    />
                                    <PasswordInput
                                        label="Password"
                                        placeholder="••••••••"
                                        value={data.password}
                                        onChange={(e) =>
                                            setData('password', e.target.value)
                                        }
                                        error={errors.password}
                                        required
                                    />
                                    <Checkbox
                                        label="Remember me"
                                        checked={data.remember}
                                        onChange={(e) =>
                                            setData(
                                                'remember',
                                                e.currentTarget.checked,
                                            )
                                        }
                                    />
                                    <Group gap="sm">
                                        <Button
                                            type="submit"
                                            loading={processing}
                                            fullWidth
                                        >
                                            Sign In
                                        </Button>
                                        {showQuickLogin && (
                                            <Anchor
                                                component="a"
                                                href="/laravel-login-link-login"
                                                onClick={handleQuickLogin}
                                            >
                                                Quick Login
                                            </Anchor>
                                        )}
                                    </Group>
                                </Stack>
                            </form>
                        </Card>

                        <Text ta="center" size="sm" c="dimmed">
                            <Anchor href="/">← Back to home</Anchor>
                        </Text>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

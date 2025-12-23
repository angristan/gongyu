import { Head, useForm } from '@inertiajs/react';
import {
    Anchor,
    Box,
    Button,
    Card,
    Checkbox,
    Container,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/login');
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
                                    <Button
                                        type="submit"
                                        loading={processing}
                                        fullWidth
                                    >
                                        Sign In
                                    </Button>
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

import { Head, useForm } from '@inertiajs/react';
import {
    Box,
    Button,
    Card,
    Container,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
export default function Setup() {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/setup');
    };

    return (
        <>
            <Head title="Setup" />
            <Box bg="var(--mantine-color-body)" mih="100vh" py="xl">
                <Container size="xs">
                    <Stack gap="lg">
                        <Stack gap="xs" ta="center">
                            <Title order={1}>Welcome to Gongyu</Title>
                            <Text c="dimmed">
                                Create your admin account to get started
                            </Text>
                        </Stack>

                        <Card withBorder p="xl">
                            <form onSubmit={handleSubmit}>
                                <Stack gap="md">
                                    <TextInput
                                        label="Name"
                                        placeholder="Your name"
                                        value={data.name}
                                        onChange={(e) =>
                                            setData('name', e.target.value)
                                        }
                                        error={errors.name}
                                        required
                                    />
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
                                    <PasswordInput
                                        label="Confirm Password"
                                        placeholder="••••••••"
                                        value={data.password_confirmation}
                                        onChange={(e) =>
                                            setData(
                                                'password_confirmation',
                                                e.target.value,
                                            )
                                        }
                                        error={errors.password_confirmation}
                                        required
                                    />
                                    <Button
                                        type="submit"
                                        loading={processing}
                                        fullWidth
                                    >
                                        Create Account
                                    </Button>
                                </Stack>
                            </form>
                        </Card>
                    </Stack>
                </Container>
            </Box>
        </>
    );
}

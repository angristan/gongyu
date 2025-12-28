import { router } from '@inertiajs/react';
import {
    Alert,
    Button,
    Card,
    Group,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

interface DeleteResult {
    deleted: number;
}

interface Props {
    deleteResult?: DeleteResult;
    bookmarkCount: number;
}

const CONFIRMATION_TEXT = 'DELETE ALL BOOKMARKS';

export function DangerZoneTab({ deleteResult, bookmarkCount }: Props) {
    const [confirmation, setConfirmation] = useState('');
    const [processing, setProcessing] = useState(false);

    const handleDelete = () => {
        if (confirmation !== CONFIRMATION_TEXT) return;

        router.delete('/admin/bookmarks/all', {
            data: { confirmation },
            onStart: () => setProcessing(true),
            onFinish: () => {
                setProcessing(false);
                setConfirmation('');
            },
        });
    };

    return (
        <Stack gap="md">
            {deleteResult && (
                <Alert
                    icon={<IconCheck size={16} />}
                    color="green"
                    title="Deletion Complete"
                >
                    Successfully deleted {deleteResult.deleted} bookmarks.
                </Alert>
            )}

            <Card
                withBorder
                p="xl"
                style={{ borderColor: 'var(--mantine-color-red-6)' }}
            >
                <Stack gap="md">
                    <Group gap="xs">
                        <IconAlertTriangle
                            size={24}
                            color="var(--mantine-color-red-6)"
                        />
                        <Title order={3} c="red">
                            Danger Zone
                        </Title>
                    </Group>

                    <Text size="sm" c="dimmed">
                        Actions in this section are destructive and cannot be
                        undone.
                    </Text>

                    <Card withBorder p="lg" bg="red.0">
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start">
                                <div>
                                    <Text fw={600}>Delete all bookmarks</Text>
                                    <Text size="sm" c="dimmed">
                                        Permanently delete all {bookmarkCount}{' '}
                                        bookmarks from the database. This action
                                        cannot be undone.
                                    </Text>
                                </div>
                            </Group>

                            <Text size="sm">
                                To confirm, type{' '}
                                <Text span fw={700} ff="monospace">
                                    {CONFIRMATION_TEXT}
                                </Text>{' '}
                                below:
                            </Text>

                            <TextInput
                                placeholder={CONFIRMATION_TEXT}
                                value={confirmation}
                                onChange={(e) =>
                                    setConfirmation(e.target.value)
                                }
                                styles={{
                                    input: {
                                        fontFamily: 'monospace',
                                    },
                                }}
                            />

                            <Button
                                color="red"
                                leftSection={<IconTrash size={16} />}
                                disabled={
                                    confirmation !== CONFIRMATION_TEXT ||
                                    bookmarkCount === 0
                                }
                                loading={processing}
                                onClick={handleDelete}
                            >
                                Delete All Bookmarks
                            </Button>
                        </Stack>
                    </Card>
                </Stack>
            </Card>
        </Stack>
    );
}

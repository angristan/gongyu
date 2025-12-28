import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconDownload, IconFileText, IconJson } from '@tabler/icons-react';

export function ExportTab() {
    const handleExport = (format: 'html' | 'json') => {
        window.location.href = `/admin/export?format=${format}`;
    };

    return (
        <Stack gap="md">
            <Card withBorder p="xl">
                <Stack gap="md">
                    <Title order={3}>Export Bookmarks</Title>
                    <Text size="sm" c="dimmed">
                        Download all your bookmarks in various formats.
                    </Text>

                    <Group grow>
                        <Card withBorder p="lg">
                            <Stack gap="md" align="center">
                                <IconFileText size={32} stroke={1.5} />
                                <Title order={4}>HTML Export</Title>
                                <Text size="sm" c="dimmed" ta="center">
                                    Netscape bookmark format. Compatible with
                                    browsers and Shaarli for re-import.
                                </Text>
                                <Button
                                    variant="light"
                                    leftSection={<IconDownload size={16} />}
                                    onClick={() => handleExport('html')}
                                >
                                    Download HTML
                                </Button>
                            </Stack>
                        </Card>

                        <Card withBorder p="lg">
                            <Stack gap="md" align="center">
                                <IconJson size={32} stroke={1.5} />
                                <Title order={4}>JSON Export</Title>
                                <Text size="sm" c="dimmed" ta="center">
                                    Full data backup with all fields. Best for
                                    migration or backup purposes.
                                </Text>
                                <Button
                                    variant="light"
                                    leftSection={<IconDownload size={16} />}
                                    onClick={() => handleExport('json')}
                                >
                                    Download JSON
                                </Button>
                            </Stack>
                        </Card>
                    </Group>
                </Stack>
            </Card>

            <Card withBorder p="lg">
                <Stack gap="sm">
                    <Title order={4}>Export Formats</Title>
                    <Stack gap="xs">
                        <Text size="sm">
                            <strong>HTML:</strong> Standard Netscape bookmark
                            format that can be imported into browsers or other
                            bookmark managers. Includes custom SHORTURL
                            attribute for re-importing into this application.
                        </Text>
                        <Text size="sm">
                            <strong>JSON:</strong> Complete data export
                            including all bookmark fields, timestamps, and
                            metadata. Ideal for backups or migrating to another
                            system.
                        </Text>
                    </Stack>
                </Stack>
            </Card>
        </Stack>
    );
}

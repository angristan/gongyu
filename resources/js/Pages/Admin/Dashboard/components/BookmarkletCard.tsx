import {
    ActionIcon,
    Card,
    Code,
    CopyButton,
    Group,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';

interface Props {
    bookmarkletUrl: string;
}

export function BookmarkletCard({ bookmarkletUrl }: Props) {
    const bookmarkletCode = `javascript:(function(){window.open('${bookmarkletUrl}?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&description='+encodeURIComponent(window.getSelection())+'&source=bookmarklet','gongyu','width=600,height=500');})();`;

    const bookmarkletRef = useRef<HTMLAnchorElement>(null);

    useEffect(() => {
        if (bookmarkletRef.current) {
            bookmarkletRef.current.setAttribute('href', bookmarkletCode);
        }
    }, [bookmarkletCode]);

    return (
        <Card withBorder p="lg">
            <Stack gap="md">
                <Title order={4}>Bookmarklet</Title>
                <Text size="sm" c="dimmed">
                    Drag the button below to your bookmarks bar, or copy the
                    code to create a bookmarklet manually.
                </Text>

                <Group>
                    <a
                        ref={bookmarkletRef}
                        onClick={(e) => e.preventDefault()}
                        draggable
                        style={{
                            padding: '8px 16px',
                            borderRadius: 'var(--mantine-radius-default)',
                            backgroundColor: 'var(--mantine-color-blue-filled)',
                            color: 'white',
                            textDecoration: 'none',
                            fontSize: 'var(--mantine-font-size-sm)',
                            fontWeight: 600,
                            cursor: 'grab',
                        }}
                    >
                        + Add to Gongyu
                    </a>
                    <Text size="sm" c="dimmed">
                        Drag this to your bookmarks bar
                    </Text>
                </Group>

                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" fw={500}>
                            Bookmarklet Code
                        </Text>
                        <CopyButton value={bookmarkletCode}>
                            {({ copied, copy }) => (
                                <Tooltip label={copied ? 'Copied' : 'Copy'}>
                                    <ActionIcon variant="subtle" onClick={copy}>
                                        {copied ? (
                                            <IconCheck size={16} />
                                        ) : (
                                            <IconCopy size={16} />
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
    );
}

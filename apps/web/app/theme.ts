import { createTheme } from '@mantine/core';

const fontFamily =
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const gongyuTheme = createTheme({
    cursorType: 'pointer',
    defaultRadius: 'md',
    focusRing: 'auto',
    fontFamily,
    headings: {
        fontFamily,
        fontWeight: '650',
    },
    primaryColor: 'indigo',
    primaryShade: { dark: 5, light: 7 },
});

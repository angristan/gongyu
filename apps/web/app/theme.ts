import { createTheme, type MantineColorsTuple } from '@mantine/core';

const fontFamily =
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const hearth: MantineColorsTuple = [
    '#fff5ed',
    '#ffe6d4',
    '#fbccae',
    '#f3aa7d',
    '#e88756',
    '#d96b3c',
    '#b9502d',
    '#963f27',
    '#793322',
    '#622c20',
];

const warmGray: MantineColorsTuple = [
    '#faf8f5',
    '#f1ede8',
    '#e4ddd5',
    '#d2c7bb',
    '#afa398',
    '#8b8178',
    '#6c635b',
    '#514a44',
    '#393430',
    '#272421',
];

const warmDark: MantineColorsTuple = [
    '#d8d2cb',
    '#b8b0a7',
    '#948b82',
    '#6f675f',
    '#514a44',
    '#3d3732',
    '#302b27',
    '#26221f',
    '#1e1b18',
    '#171513',
];

export const gongyuTheme = createTheme({
    autoContrast: true,
    black: '#211d19',
    colors: {
        dark: warmDark,
        gray: warmGray,
        hearth,
    },
    cursorType: 'pointer',
    defaultRadius: 'md',
    focusRing: 'auto',
    fontFamily,
    headings: {
        fontFamily,
        fontWeight: '650',
    },
    luminanceThreshold: 0.32,
    primaryColor: 'hearth',
    primaryShade: { dark: 5, light: 6 },
    white: '#fffdfa',
});

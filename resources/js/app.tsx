import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';

import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { createTheme, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';

const appName = import.meta.env.VITE_APP_NAME || 'Gongyu';

const theme = createTheme({
    primaryColor: 'blue',
    colors: {
        dark: [
            '#C9C9C9',
            '#B8B8B8',
            '#828282',
            '#696969',
            '#424242',
            '#3B3B3B',
            '#2E2E2E',
            '#242424',
            '#1F1F1F',
            '#141414',
        ],
    },
});

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob('./Pages/**/*.tsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(
            <MantineProvider theme={theme} defaultColorScheme="auto">
                <Notifications />
                <App {...props} />
            </MantineProvider>,
        );
    },
    progress: {
        color: '#4B5563',
    },
});

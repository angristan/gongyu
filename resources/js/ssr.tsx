import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';

import { createInertiaApp } from '@inertiajs/react';
import createServer from '@inertiajs/react/server';
import { createTheme, MantineProvider } from '@mantine/core';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import ReactDOMServer from 'react-dom/server';

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

createServer(
    (page) =>
        createInertiaApp({
            page,
            render: ReactDOMServer.renderToString,
            title: (title) => (title ? `${title} - ${appName}` : appName),
            resolve: (name) =>
                resolvePageComponent(
                    `./Pages/${name}.tsx`,
                    import.meta.glob('./Pages/**/*.tsx'),
                ),
            setup: ({ App, props }) => (
                <MantineProvider theme={theme} defaultColorScheme="auto">
                    <App {...props} />
                </MantineProvider>
            ),
        }),
    { cluster: true },
);

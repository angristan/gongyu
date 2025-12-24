import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';

import '../css/app.css';

import UmamiAnalytics from '@danielgtmn/umami-react';
import { createInertiaApp } from '@inertiajs/react';
import { createTheme, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';

const appName = import.meta.env.VITE_APP_NAME || 'Gongyu';

const theme = createTheme({
    primaryColor: 'cozy',
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
        // Warm cozy brown/amber palette
        cozy: [
            '#FDF8F3', // 0: lightest - card background
            '#F5EBE0', // 1: light cream
            '#E8D5C4', // 2: warm beige (borders)
            '#D4B896', // 3: tan (badges)
            '#C4A77D', // 4: warm brown (focus)
            '#A67C52', // 5: medium brown (muted)
            '#8B5E3C', // 6: darker brown (text)
            '#6F4E37', // 7: coffee brown
            '#5C4033', // 8: dark brown (titles)
            '#3E2723', // 9: darkest
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
                {import.meta.env.VITE_UMAMI_URL &&
                    import.meta.env.VITE_UMAMI_WEBSITE_ID && (
                        <UmamiAnalytics
                            url={import.meta.env.VITE_UMAMI_URL}
                            websiteId={import.meta.env.VITE_UMAMI_WEBSITE_ID}
                        />
                    )}
                <App {...props} />
            </MantineProvider>,
        );
    },
    progress: {
        color: '#4B5563',
    },
});

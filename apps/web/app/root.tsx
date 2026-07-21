import '@mantine/core/styles.css';
import { DataRunRepository } from '@gongyu/data/data-run-repository';
import { SettingsRepository } from '@gongyu/data/settings-repository';
import { PageShell } from '@gongyu/ui/page-shell';
import {
    ColorSchemeScript,
    MantineProvider,
    mantineHtmlProps,
} from '@mantine/core';
import { Effect } from 'effect';
import type { ReactNode } from 'react';
import {
    isRouteErrorResponse,
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useRouteLoaderData,
} from 'react-router';
import type { Route } from './+types/root';
import { AppShell } from './components/app-shell';
import { cloudflareRequestContext } from './platform-context';
import { gongyuTheme } from './theme';
import { readThemeMode } from './theme.server';
import './app.css';

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    const { appState, libraryName } = await effect.runPromise(
        Effect.gen(function* () {
            const dataRuns = yield* DataRunRepository;
            const settings = yield* SettingsRepository;
            return {
                appState: yield* dataRuns.getAppState,
                libraryName: yield* settings.getLibraryName,
            };
        }),
    );
    return {
        appState,
        authenticated: authentication.authenticated,
        csrfToken: authentication.authenticated
            ? authentication.csrfToken
            : null,
        libraryName,
        themeMode: await readThemeMode(request),
    };
}

export function Layout({ children }: { readonly children: ReactNode }) {
    const rootData = useRouteLoaderData<typeof loader>('root');
    const themeMode = rootData?.themeMode ?? 'light';

    return (
        <html {...mantineHtmlProps} data-mode={themeMode} lang="en">
            <head>
                <meta charSet="utf-8" />
                <link rel="icon" href="/images/logo.png" type="image/png" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <ColorSchemeScript forceColorScheme={themeMode} />
                <Meta />
                <Links />
            </head>
            <body>
                <a
                    className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-gongyu-base px-3 py-2 text-gongyu-link shadow focus:translate-y-0"
                    href="#main-content"
                >
                    Skip to main content
                </a>
                {rootData?.appState.readOnly === 1 ? (
                    <output className="block w-full border-b border-gongyu-line bg-gongyu-base px-4 py-3 text-center text-sm font-medium text-gongyu-default">
                        Gongyu is temporarily read-only while a backup or
                        restore is in progress.
                    </output>
                ) : null}
                <MantineProvider
                    forceColorScheme={themeMode}
                    theme={gongyuTheme}
                >
                    {children}
                </MantineProvider>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App() {
    const rootData = useRouteLoaderData<typeof loader>('root');
    return (
        <AppShell
            authenticated={rootData?.authenticated ?? false}
            csrfToken={rootData?.csrfToken ?? null}
            libraryName={rootData?.libraryName ?? 'Gongyu'}
            themeMode={rootData?.themeMode ?? 'light'}
        >
            <Outlet />
        </AppShell>
    );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    let title = 'Unexpected error';
    let detail = 'The request could not be completed.';

    if (isRouteErrorResponse(error)) {
        title = error.status === 404 ? 'Not found' : 'Request failed';
        detail =
            typeof error.data === 'string' && error.data !== ''
                ? error.data
                : error.statusText || detail;
    } else if (import.meta.env.DEV && error instanceof Error) {
        detail = error.message;
    }

    return <PageShell description={detail} eyebrow="Gongyu" title={title} />;
}

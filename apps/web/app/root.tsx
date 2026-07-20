import { type LinkComponentProps, LinkProvider } from '@cloudflare/kumo/utils';
import { DataRunRepository } from '@gongyu/data/data-run-repository';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import { forwardRef, type ReactNode } from 'react';
import {
    isRouteErrorResponse,
    Links,
    Meta,
    Outlet,
    Link as RouterLink,
    Scripts,
    ScrollRestoration,
    useRouteLoaderData,
} from 'react-router';
import type { Route } from './+types/root';
import { AppShell } from './components/app-shell';
import { cloudflareRequestContext } from './platform-context';
import { readThemeMode } from './theme.server';
import './app.css';

const AppLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(
    ({ href, to, target, ...props }, ref) => {
        const destination = href ?? to ?? '';
        const requiresDocumentNavigation =
            (target !== undefined && target !== '_self') ||
            /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination);

        return requiresDocumentNavigation ? (
            <a ref={ref} href={destination} target={target} {...props} />
        ) : (
            <RouterLink ref={ref} to={destination} target={target} {...props} />
        );
    },
);
AppLink.displayName = 'AppLink';

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    const appState = await effect.runPromise(
        Effect.gen(function* () {
            const repository = yield* DataRunRepository;
            return yield* repository.getAppState;
        }),
    );
    return {
        appState,
        authenticated: authentication.authenticated,
        csrfToken: authentication.authenticated
            ? authentication.csrfToken
            : null,
        themeMode: await readThemeMode(request),
    };
}

export function Layout({ children }: { readonly children: ReactNode }) {
    const rootData = useRouteLoaderData<typeof loader>('root');
    const themeMode = rootData?.themeMode ?? 'light';

    return (
        <html lang="en" data-mode={themeMode}>
            <head>
                <meta charSet="utf-8" />
                <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <Meta />
                <Links />
            </head>
            <body>
                <a
                    className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-kumo-base px-3 py-2 text-kumo-link shadow focus:translate-y-0"
                    href="#main-content"
                >
                    Skip to main content
                </a>
                {rootData?.appState.readOnly === 1 ? (
                    <output className="block w-full border-b border-kumo-line bg-kumo-base px-4 py-3 text-center text-sm font-medium text-kumo-default">
                        Gongyu is temporarily read-only while a backup or
                        restore is in progress.
                    </output>
                ) : null}
                <LinkProvider component={AppLink}>{children}</LinkProvider>
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

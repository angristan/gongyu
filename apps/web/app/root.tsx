import { type LinkComponentProps, LinkProvider } from '@cloudflare/kumo/utils';
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

export async function loader({ request }: Route.LoaderArgs) {
    return { themeMode: await readThemeMode(request) };
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
                <LinkProvider component={AppLink}>{children}</LinkProvider>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App() {
    return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    let title = 'Unexpected error';
    let detail = 'The request could not be completed.';

    if (isRouteErrorResponse(error)) {
        title = error.status === 404 ? 'Not found' : 'Request failed';
        detail = error.statusText || detail;
    } else if (import.meta.env.DEV && error instanceof Error) {
        detail = error.message;
    }

    return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
            <p className="text-sm font-medium text-kumo-subtle">Gongyu</p>
            <h1 className="text-3xl font-semibold text-kumo-default">
                {title}
            </h1>
            <p className="text-kumo-subtle">{detail}</p>
        </main>
    );
}

import { LinkButton } from '@cloudflare/kumo/components/button';
import { cn } from '@cloudflare/kumo/utils';
import {
    ArrowSquareOutIcon,
    BookmarkSimpleIcon,
    ChartLineUpIcon,
    DatabaseIcon,
    GearIcon,
    ListIcon,
    ListMagnifyingGlassIcon,
    MoonIcon,
    PlusIcon,
    QueueIcon,
    RssSimpleIcon,
    ShieldCheckIcon,
    SignInIcon,
    SignOutIcon,
    SunIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Form, Link, useLocation } from 'react-router';
import type { ThemeMode } from '../theme.server';

interface AppShellProps {
    readonly authenticated: boolean;
    readonly children: ReactNode;
    readonly csrfToken: string | null;
    readonly themeMode: ThemeMode;
}

interface NavigationItem {
    readonly href: string;
    readonly icon: typeof BookmarkSimpleIcon;
    readonly label: string;
    readonly match?: 'exact' | 'prefix';
}

const libraryNavigation: ReadonlyArray<NavigationItem> = [
    {
        href: '/admin/bookmarks/new',
        icon: PlusIcon,
        label: 'Save bookmark',
        match: 'exact',
    },
    {
        href: '/admin/bookmarks',
        icon: BookmarkSimpleIcon,
        label: 'Bookmarks',
        match: 'prefix',
    },
    {
        href: '/admin/dashboard',
        icon: ChartLineUpIcon,
        label: 'Overview',
        match: 'exact',
    },
];

const toolsNavigation: ReadonlyArray<NavigationItem> = [
    {
        href: '/admin/jobs',
        icon: QueueIcon,
        label: 'Background work',
        match: 'exact',
    },
    {
        href: '/admin/data',
        icon: DatabaseIcon,
        label: 'Data & recovery',
        match: 'exact',
    },
    {
        href: '/admin/settings',
        icon: GearIcon,
        label: 'Settings',
        match: 'exact',
    },
    {
        href: '/admin/security',
        icon: ShieldCheckIcon,
        label: 'Security',
        match: 'exact',
    },
    {
        href: '/bookmarklet',
        icon: ListMagnifyingGlassIcon,
        label: 'Bookmarklet',
        match: 'exact',
    },
];

function isActive(pathname: string, item: NavigationItem): boolean {
    if (item.match === 'prefix') {
        return (
            pathname === item.href ||
            (pathname.startsWith(`${item.href}/`) &&
                pathname !== '/admin/bookmarks/new')
        );
    }
    return pathname === item.href;
}

function Brand({
    compact = false,
    href = '/',
}: {
    readonly compact?: boolean;
    readonly href?: string;
}) {
    return (
        <Link
            aria-label="Gongyu home"
            className="group flex min-w-0 items-center gap-2.5 text-kumo-default no-underline"
            to={href}
        >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-kumo-brand text-sm font-bold text-kumo-inverse shadow-sm shadow-kumo-brand/15">
                G
            </span>
            {compact ? null : (
                <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-semibold tracking-[-0.01em]">
                        Gongyu
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-kumo-subtle">
                        Personal bookmarks
                    </span>
                </span>
            )}
        </Link>
    );
}

function ThemeForm({
    returnTo,
    themeMode,
}: {
    readonly returnTo: string;
    readonly themeMode: ThemeMode;
}) {
    const nextMode = themeMode === 'light' ? 'dark' : 'light';
    const Icon = nextMode === 'dark' ? MoonIcon : SunIcon;
    return (
        <Form action="/theme" method="post">
            <input name="mode" type="hidden" value={nextMode} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <button
                aria-label={`Use ${nextMode} mode`}
                className="inline-flex size-8 items-center justify-center rounded-lg text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus"
                type="submit"
            >
                <Icon aria-hidden="true" size={17} />
            </button>
        </Form>
    );
}

function PublicShell({
    authenticated,
    children,
    themeMode,
}: Omit<AppShellProps, 'csrfToken'>) {
    const location = useLocation();
    const returnTo = `${location.pathname}${location.search}`;
    return (
        <div className="gongyu-public-app min-h-screen bg-kumo-base">
            <header className="sticky top-0 z-40 border-b border-kumo-line bg-kumo-base/95 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                    <Brand />
                    <nav
                        aria-label="Public navigation"
                        className="flex items-center gap-1 sm:gap-2"
                    >
                        <LinkButton
                            className="hidden sm:inline-flex"
                            href="/search"
                            icon={ListMagnifyingGlassIcon}
                            variant="ghost"
                        >
                            Search
                        </LinkButton>
                        <LinkButton
                            aria-label="Atom feed"
                            href="/feed"
                            icon={RssSimpleIcon}
                            shape="square"
                            variant="ghost"
                        />
                        <ThemeForm returnTo={returnTo} themeMode={themeMode} />
                        <LinkButton
                            href={authenticated ? '/admin/bookmarks' : '/login'}
                            icon={
                                authenticated ? BookmarkSimpleIcon : SignInIcon
                            }
                            variant="secondary"
                        >
                            <span className="hidden sm:inline">
                                {authenticated ? 'Manage' : 'Sign in'}
                            </span>
                        </LinkButton>
                    </nav>
                </div>
            </header>
            {children}
            <footer className="border-t border-kumo-line px-4 py-8 text-sm text-kumo-subtle sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p>Gongyu · a calm place for links worth keeping.</p>
                    <div className="flex items-center gap-4">
                        <Link className="text-kumo-link" to="/search">
                            Search
                        </Link>
                        <a className="text-kumo-link" href="/feed">
                            Atom feed
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function NavigationSection({
    items,
    label,
    pathname,
}: {
    readonly items: ReadonlyArray<NavigationItem>;
    readonly label: string;
    readonly pathname: string;
}) {
    return (
        <section>
            <h2 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-kumo-subtle/75">
                {label}
            </h2>
            <ul className="space-y-0.5">
                {items.map((item) => {
                    const active = isActive(pathname, item);
                    const Icon = item.icon;
                    return (
                        <li key={item.href}>
                            <Link
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                                    active
                                        ? 'bg-kumo-brand/10 text-kumo-link'
                                        : 'text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default',
                                )}
                                to={item.href}
                            >
                                <Icon aria-hidden="true" size={17} />
                                <span className="truncate">{item.label}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function AdminNavigation({ pathname }: { readonly pathname: string }) {
    return (
        <nav aria-label="Administrator navigation" className="space-y-5">
            <NavigationSection
                items={libraryNavigation}
                label="Library"
                pathname={pathname}
            />
            <NavigationSection
                items={toolsNavigation}
                label="Tools"
                pathname={pathname}
            />
        </nav>
    );
}

function SessionActions({
    csrfToken,
    returnTo,
    themeMode,
}: {
    readonly csrfToken: string | null;
    readonly returnTo: string;
    readonly themeMode: ThemeMode;
}) {
    return (
        <div className="flex items-center gap-1">
            <ThemeForm returnTo={returnTo} themeMode={themeMode} />
            <Form action="/logout" method="post">
                <input name="_csrf" type="hidden" value={csrfToken ?? ''} />
                <button
                    aria-label="Sign out"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus"
                    type="submit"
                >
                    <SignOutIcon aria-hidden="true" size={17} />
                </button>
            </Form>
        </div>
    );
}

function AdminShell({
    children,
    csrfToken,
    themeMode,
}: Omit<AppShellProps, 'authenticated'>) {
    const location = useLocation();
    const returnTo = `${location.pathname}${location.search}`;
    const currentPage = [...libraryNavigation, ...toolsNavigation].find(
        (item) => isActive(location.pathname, item),
    )?.label;

    return (
        <div className="min-h-svh bg-kumo-base lg:flex">
            <aside
                className="sticky top-0 hidden h-svh w-52 shrink-0 flex-col border-r border-kumo-line bg-kumo-recessed/55 lg:flex"
                data-admin-sidebar=""
            >
                <div className="flex h-16 items-center border-b border-kumo-line px-4">
                    <Brand href="/admin/bookmarks" />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
                    <AdminNavigation pathname={location.pathname} />
                </div>
                <div className="border-t border-kumo-line p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <Link
                            className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
                            to="/"
                        >
                            <ArrowSquareOutIcon aria-hidden="true" size={16} />
                            Public site
                        </Link>
                        <SessionActions
                            csrfToken={csrfToken}
                            returnTo={returnTo}
                            themeMode={themeMode}
                        />
                    </div>
                </div>
            </aside>

            <div className="min-w-0 flex-1">
                <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-kumo-line bg-kumo-base/95 px-4 backdrop-blur lg:hidden">
                    <div className="flex min-w-0 items-center gap-3">
                        <details className="group relative">
                            <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus">
                                <ListIcon aria-hidden="true" size={19} />
                                <span className="sr-only">Menu</span>
                            </summary>
                            <div className="absolute left-0 top-10 z-50 w-64 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-xl">
                                <AdminNavigation pathname={location.pathname} />
                                <div className="mt-4 flex items-center justify-between border-t border-kumo-line pt-3">
                                    <Link
                                        className="flex items-center gap-2 text-xs text-kumo-subtle"
                                        to="/"
                                    >
                                        <ArrowSquareOutIcon
                                            aria-hidden="true"
                                            size={16}
                                        />
                                        Public site
                                    </Link>
                                    <SessionActions
                                        csrfToken={csrfToken}
                                        returnTo={returnTo}
                                        themeMode={themeMode}
                                    />
                                </div>
                            </div>
                        </details>
                        <Brand compact href="/admin/bookmarks" />
                        <span className="truncate text-sm font-medium text-kumo-default">
                            {currentPage ?? 'Library'}
                        </span>
                    </div>
                </header>
                {children}
            </div>
        </div>
    );
}

export function AppShell({
    authenticated,
    children,
    csrfToken,
    themeMode,
}: AppShellProps) {
    const location = useLocation();
    const isAdminSurface =
        authenticated &&
        (location.pathname.startsWith('/admin') ||
            location.pathname === '/bookmarklet' ||
            location.pathname === '/passkey');

    return isAdminSurface ? (
        <AdminShell csrfToken={csrfToken} themeMode={themeMode}>
            {children}
        </AdminShell>
    ) : (
        <PublicShell authenticated={authenticated} themeMode={themeMode}>
            {children}
        </PublicShell>
    );
}

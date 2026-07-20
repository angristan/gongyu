import { LinkButton } from '@cloudflare/kumo/components/button';
import { Sidebar } from '@cloudflare/kumo/components/sidebar';
import {
    ArrowSquareOutIcon,
    BookmarkSimpleIcon,
    ChartLineUpIcon,
    DatabaseIcon,
    GearIcon,
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
import type { CSSProperties, ReactNode } from 'react';
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

const primaryNavigation: ReadonlyArray<NavigationItem> = [
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

const operationsNavigation: ReadonlyArray<NavigationItem> = [
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
];

const configurationNavigation: ReadonlyArray<NavigationItem> = [
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
            className="group flex min-w-0 items-center gap-3 text-kumo-default no-underline"
            to={href}
        >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-kumo-brand text-sm font-semibold text-kumo-inverse">
                G
            </span>
            {compact ? null : (
                <span className="min-w-0">
                    <span className="block truncate text-base font-semibold tracking-tight">
                        Gongyu
                    </span>
                    <span className="block truncate text-xs text-kumo-subtle">
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
                className="inline-flex size-9 items-center justify-center rounded-lg text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus"
                type="submit"
            >
                <Icon aria-hidden="true" size={18} />
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
                            icon={authenticated ? ChartLineUpIcon : SignInIcon}
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

function NavigationGroup({
    items,
    label,
    pathname,
}: {
    readonly items: ReadonlyArray<NavigationItem>;
    readonly label: string;
    readonly pathname: string;
}) {
    return (
        <Sidebar.Group>
            <Sidebar.GroupLabel>{label}</Sidebar.GroupLabel>
            <Sidebar.Menu>
                {items.map((item) => (
                    <Sidebar.MenuButton
                        active={isActive(pathname, item)}
                        href={item.href}
                        icon={item.icon}
                        key={item.href}
                        tooltip={item.label}
                    >
                        {item.label}
                    </Sidebar.MenuButton>
                ))}
            </Sidebar.Menu>
        </Sidebar.Group>
    );
}

function NoJavaScriptAdminNavigation({
    csrfToken,
    returnTo,
    themeMode,
}: {
    readonly csrfToken: string | null;
    readonly returnTo: string;
    readonly themeMode: ThemeMode;
}) {
    const items = [
        ...primaryNavigation,
        ...operationsNavigation,
        ...configurationNavigation,
    ];
    return (
        <noscript>
            <style>{'.gongyu-sidebar-trigger{display:none}'}</style>
            <details className="relative">
                <summary className="cursor-pointer rounded-lg px-2 py-1.5 text-sm font-medium text-kumo-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus">
                    Menu
                </summary>
                <div className="absolute left-0 top-10 z-50 w-[min(18rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-lg">
                    <nav aria-label="Administrator navigation">
                        <ul className="space-y-1">
                            {items.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        className="block rounded-lg px-3 py-2 text-sm font-medium text-kumo-default hover:bg-kumo-tint"
                                        to={item.href}
                                    >
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                            <li>
                                <Link
                                    className="block rounded-lg px-3 py-2 text-sm font-medium text-kumo-default hover:bg-kumo-tint"
                                    to="/"
                                >
                                    View public site
                                </Link>
                            </li>
                        </ul>
                    </nav>
                    <div className="flex items-center gap-2 border-t border-kumo-line pt-3">
                        <ThemeForm returnTo={returnTo} themeMode={themeMode} />
                        <Form action="/logout" method="post">
                            <input
                                name="_csrf"
                                type="hidden"
                                value={csrfToken ?? ''}
                            />
                            <button
                                className="rounded-lg px-3 py-2 text-sm font-medium text-kumo-default hover:bg-kumo-tint"
                                type="submit"
                            >
                                Sign out
                            </button>
                        </Form>
                    </div>
                </div>
            </details>
        </noscript>
    );
}

function AdminShell({
    children,
    csrfToken,
    themeMode,
}: Omit<AppShellProps, 'authenticated'>) {
    const location = useLocation();
    const returnTo = `${location.pathname}${location.search}`;
    const currentPage = [
        ...primaryNavigation,
        ...operationsNavigation,
        ...configurationNavigation,
    ].find((item) => isActive(location.pathname, item))?.label;
    return (
        <Sidebar.Provider
            collapsible="icon"
            defaultOpen
            style={
                {
                    '--sidebar-bg': 'var(--color-kumo-recessed)',
                } as CSSProperties
            }
        >
            <Sidebar className="gongyu-admin-sidebar bg-kumo-recessed">
                <Sidebar.Header>
                    <Brand href="/admin/bookmarks" />
                </Sidebar.Header>
                <Sidebar.Content>
                    <NavigationGroup
                        items={primaryNavigation}
                        label="Library"
                        pathname={location.pathname}
                    />
                    <NavigationGroup
                        items={[
                            ...operationsNavigation,
                            ...configurationNavigation,
                        ]}
                        label="Tools"
                        pathname={location.pathname}
                    />
                </Sidebar.Content>
                <Sidebar.Footer className="h-auto flex-col items-stretch gap-2 py-3">
                    <Sidebar.Menu>
                        <Sidebar.MenuButton
                            href="/"
                            icon={ArrowSquareOutIcon}
                            tooltip="View public site"
                        >
                            View public site
                        </Sidebar.MenuButton>
                    </Sidebar.Menu>
                    <div className="flex items-center justify-between gap-2 px-1">
                        <ThemeForm returnTo={returnTo} themeMode={themeMode} />
                        <Form action="/logout" method="post">
                            <input
                                name="_csrf"
                                type="hidden"
                                value={csrfToken ?? ''}
                            />
                            <button
                                aria-label="Sign out"
                                className="inline-flex size-9 items-center justify-center rounded-lg text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus"
                                type="submit"
                            >
                                <SignOutIcon aria-hidden="true" size={18} />
                            </button>
                        </Form>
                        <Sidebar.Trigger aria-label="Collapse navigation" />
                    </div>
                </Sidebar.Footer>
                <Sidebar.Rail />
            </Sidebar>
            <div className="min-w-0 flex-1 bg-kumo-base">
                <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-kumo-line bg-kumo-base/95 px-4 backdrop-blur md:hidden">
                    <Sidebar.Trigger
                        aria-label="Open navigation"
                        className="gongyu-sidebar-trigger"
                    />
                    <NoJavaScriptAdminNavigation
                        csrfToken={csrfToken}
                        returnTo={returnTo}
                        themeMode={themeMode}
                    />
                    <Brand compact href="/admin/bookmarks" />
                    <span className="truncate text-sm text-kumo-subtle">
                        {currentPage ?? 'Library'}
                    </span>
                </header>
                {children}
            </div>
        </Sidebar.Provider>
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

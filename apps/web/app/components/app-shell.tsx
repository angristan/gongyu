import {
    ArrowSquareOutIcon,
    BookmarkSimpleIcon,
    ChartLineUpIcon,
    DatabaseIcon,
    GearIcon,
    GithubLogoIcon,
    ListIcon,
    ListMagnifyingGlassIcon,
    MoonIcon,
    PlusIcon,
    QueueIcon,
    RssSimpleIcon,
    ShieldCheckIcon,
    SignOutIcon,
    SunIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Form, Link, useLocation } from 'react-router';
import type { ThemeMode } from '../theme.server';
import { Button, cn, LinkButton } from './ui';

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
        label: 'New bookmark',
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
        label: 'Install bookmarklet',
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
    heading = false,
    href = '/',
    prominent = false,
}: {
    readonly compact?: boolean;
    readonly heading?: boolean;
    readonly href?: string;
    readonly prominent?: boolean;
}) {
    const BrandName = heading ? 'h1' : 'span';
    return (
        <Link
            aria-label="Gongyu home"
            className="group flex min-w-0 items-center gap-2.5 text-gongyu-default no-underline"
            to={href}
        >
            <img
                alt=""
                className={cn(
                    'shrink-0 object-contain',
                    prominent ? 'size-10' : 'size-9',
                )}
                height={prominent ? 40 : 36}
                src="/images/logo.png"
                width={prominent ? 40 : 36}
            />
            {compact ? null : (
                <BrandName
                    className={cn(
                        'block truncate font-semibold leading-tight tracking-[-0.01em]',
                        prominent ? 'text-lg' : 'text-sm',
                    )}
                >
                    Gongyu
                </BrandName>
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
            <Button
                aria-label={`Use ${nextMode} mode`}
                icon={Icon}
                shape="square"
                type="submit"
                variant="ghost"
            />
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
    const isAuthenticationPage =
        location.pathname === '/login' || location.pathname === '/setup';
    return (
        <div className="gongyu-public-app min-h-screen bg-gongyu-base">
            <header className="pt-4 sm:pt-5">
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
                    <Brand heading={location.pathname === '/'} prominent />
                    <nav aria-label="Public navigation">
                        {isAuthenticationPage ? (
                            <Link
                                className="text-sm font-medium text-gongyu-link hover:underline"
                                to="/"
                            >
                                Back to library
                            </Link>
                        ) : authenticated ? (
                            <LinkButton
                                href="/admin/dashboard"
                                size="sm"
                                variant="primary"
                            >
                                Dashboard
                            </LinkButton>
                        ) : (
                            <Link
                                className="text-sm font-medium text-gongyu-link hover:underline"
                                to="/login"
                            >
                                Login
                            </Link>
                        )}
                    </nav>
                </div>
            </header>
            {children}
            <footer className="px-4 pb-6 pt-3 text-xs text-gongyu-subtle sm:px-6">
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 border-t border-gongyu-line pt-5">
                    <p>
                        Powered by{' '}
                        <a
                            className="font-medium text-gongyu-default hover:text-gongyu-link hover:underline"
                            href="https://github.com/angristan/gongyu"
                            rel="noreferrer"
                            target="_blank"
                        >
                            Gongyu
                        </a>
                    </p>
                    <div className="flex items-center gap-1">
                        <LinkButton
                            aria-label="Gongyu on GitHub"
                            external
                            href="https://github.com/angristan/gongyu"
                            icon={GithubLogoIcon}
                            shape="square"
                            variant="ghost"
                        />
                        <LinkButton
                            aria-label="Atom feed"
                            href="/feed"
                            icon={RssSimpleIcon}
                            shape="square"
                            variant="ghost"
                        />
                        <ThemeForm returnTo={returnTo} themeMode={themeMode} />
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
            <h2 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gongyu-subtle">
                {label}
            </h2>
            <ul>
                {items.map((item) => {
                    const active = isActive(pathname, item);
                    const Icon = item.icon;
                    return (
                        <li key={item.href}>
                            <Link
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
                                    active
                                        ? 'bg-gongyu-brand/10 text-gongyu-link'
                                        : 'text-gongyu-subtle hover:bg-gongyu-tint hover:text-gongyu-default',
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
        <nav aria-label="Administrator navigation" className="space-y-3">
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
                <Button
                    aria-label="Sign out"
                    icon={SignOutIcon}
                    shape="square"
                    type="submit"
                    variant="ghost"
                />
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
        <div className="gongyu-admin-app min-h-svh lg:flex">
            <aside
                className="gongyu-admin-sidebar sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r border-gongyu-line lg:flex"
                data-admin-sidebar=""
            >
                <div className="flex h-14 items-center border-b border-gongyu-line px-3">
                    <Brand href="/admin/bookmarks" />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
                    <AdminNavigation pathname={location.pathname} />
                </div>
                <div className="border-t border-gongyu-line p-2">
                    <div className="flex items-center justify-between gap-1">
                        <Link
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gongyu-subtle hover:bg-gongyu-tint hover:text-gongyu-default"
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

            <div className="gongyu-admin-main min-w-0 flex-1">
                <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gongyu-line bg-gongyu-base/95 px-4 backdrop-blur lg:hidden">
                    <div className="flex min-w-0 items-center gap-3">
                        <details className="group relative" key={returnTo}>
                            <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg text-gongyu-subtle hover:bg-gongyu-tint hover:text-gongyu-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gongyu-focus">
                                <ListIcon aria-hidden="true" size={19} />
                                <span className="sr-only">Menu</span>
                            </summary>
                            <div className="absolute left-0 top-10 z-50 max-h-[calc(100svh-4rem)] w-64 overflow-y-auto rounded-lg border border-gongyu-line bg-gongyu-base p-3 shadow-md">
                                <AdminNavigation pathname={location.pathname} />
                                <div className="mt-4 flex items-center justify-between border-t border-gongyu-line pt-3">
                                    <Link
                                        className="flex items-center gap-2 text-xs text-gongyu-subtle"
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
                        <span className="truncate text-sm font-medium text-gongyu-default">
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

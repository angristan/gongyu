import { Breadcrumbs } from '@cloudflare/kumo/components/breadcrumbs';
import { cn } from '@cloudflare/kumo/utils';
import type { ReactNode } from 'react';

interface AdminPageProps {
    readonly actions?: ReactNode;
    readonly children?: ReactNode;
    readonly description: ReactNode;
    readonly section?: string;
    readonly sectionHref?: string;
    readonly title: ReactNode;
    readonly width?: 'default' | 'wide';
}

export function AdminPage({
    actions,
    children,
    description,
    section,
    sectionHref,
    title,
    width = 'default',
}: AdminPageProps) {
    return (
        <main
            className={cn(
                'mx-auto flex w-full flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8',
                width === 'wide' ? 'max-w-7xl' : 'max-w-4xl',
            )}
            id="main-content"
            tabIndex={-1}
        >
            <header className="border-b border-kumo-line pb-4">
                {sectionHref === undefined ? null : (
                    <Breadcrumbs className="mb-4" size="sm">
                        <Breadcrumbs.Link href={sectionHref}>
                            {section ?? 'Back'}
                        </Breadcrumbs.Link>
                        <Breadcrumbs.Separator />
                        <Breadcrumbs.Current>{title}</Breadcrumbs.Current>
                    </Breadcrumbs>
                )}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-kumo-default">
                            {title}
                        </h1>
                        <p className="mt-1 max-w-2xl text-sm leading-5 text-kumo-subtle">
                            {description}
                        </p>
                    </div>
                    {actions === undefined ? null : (
                        <div className="flex shrink-0 flex-wrap gap-2">
                            {actions}
                        </div>
                    )}
                </div>
            </header>
            {children}
        </main>
    );
}

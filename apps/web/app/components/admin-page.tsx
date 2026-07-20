import type { ReactNode } from 'react';
import { Breadcrumbs, cn } from './ui';

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
                'mx-auto flex w-full flex-col gap-3 px-3 py-3 sm:px-5 sm:py-4 lg:px-6',
                width === 'wide' ? 'max-w-none' : 'max-w-5xl',
            )}
            id="main-content"
            tabIndex={-1}
        >
            <header className="border-b border-gongyu-line pb-3">
                {sectionHref === undefined ? null : (
                    <Breadcrumbs className="mb-2" size="sm">
                        <Breadcrumbs.Link href={sectionHref}>
                            {section ?? 'Back'}
                        </Breadcrumbs.Link>
                        <Breadcrumbs.Separator />
                        <Breadcrumbs.Current>{title}</Breadcrumbs.Current>
                    </Breadcrumbs>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold tracking-[-0.02em] text-gongyu-default">
                            {title}
                        </h1>
                        <p className="mt-0.5 max-w-2xl text-sm leading-5 text-gongyu-subtle">
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

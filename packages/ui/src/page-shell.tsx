import type { ReactNode } from 'react';

export interface PageShellProps {
    readonly actions?: ReactNode;
    readonly breadcrumbs?: ReactNode;
    readonly children?: ReactNode;
    readonly description: ReactNode;
    readonly eyebrow: ReactNode;
    readonly footer?: ReactNode;
    readonly title: ReactNode;
    readonly width?: 'default' | 'wide';
}

export function PageShell({
    actions,
    breadcrumbs,
    children,
    description,
    eyebrow,
    footer,
    title,
    width = 'default',
}: PageShellProps) {
    return (
        <main
            id="main-content"
            tabIndex={-1}
            className={`gongyu-page-shell mx-auto flex min-h-[calc(100vh-4rem)] flex-col gap-8 py-8 sm:py-10 lg:py-12 ${
                width === 'wide'
                    ? 'gongyu-page-shell-wide'
                    : 'gongyu-page-shell-default'
            }`}
        >
            <header className="space-y-5">
                {breadcrumbs === undefined ? null : breadcrumbs}
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gongyu-subtle">
                            {eyebrow}
                        </p>
                        <h1 className="max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-gongyu-default sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
                            {title}
                        </h1>
                        <p className="max-w-3xl text-base leading-7 text-gongyu-subtle sm:text-lg">
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

            {children === undefined ? null : children}

            {footer === undefined ? null : (
                <footer className="mt-auto border-t border-gongyu-line pt-6 text-sm text-gongyu-subtle">
                    {footer}
                </footer>
            )}
        </main>
    );
}

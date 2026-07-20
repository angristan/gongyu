import { cn } from '@cloudflare/kumo/utils';
import type { ReactNode } from 'react';

export interface PageShellProps {
    readonly actions?: ReactNode;
    readonly children?: ReactNode;
    readonly description: ReactNode;
    readonly eyebrow: ReactNode;
    readonly footer?: ReactNode;
    readonly title: ReactNode;
    readonly width?: 'default' | 'wide';
}

export function PageShell({
    actions,
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
            className={cn(
                'gongyu-page-shell mx-auto flex min-h-screen flex-col justify-center gap-8 py-16',
                width === 'wide'
                    ? 'gongyu-page-shell-wide'
                    : 'gongyu-page-shell-default',
            )}
        >
            <header className="space-y-3">
                <p className="text-sm font-medium text-kumo-subtle">
                    {eyebrow}
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-kumo-default sm:text-5xl">
                    {title}
                </h1>
                <p className="max-w-2xl text-lg text-kumo-subtle">
                    {description}
                </p>
                {actions === undefined ? null : (
                    <div className="flex flex-wrap gap-3 pt-2">{actions}</div>
                )}
            </header>

            {children === undefined ? null : children}

            {footer === undefined ? null : (
                <footer className="text-sm text-kumo-subtle">{footer}</footer>
            )}
        </main>
    );
}

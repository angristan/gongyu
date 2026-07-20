import { cn } from '@cloudflare/kumo/utils';
import type { ReactNode } from 'react';

export const adminPanelBodyClass = 'space-y-4 p-4';
export const adminPanelFooterClass =
    'flex flex-wrap items-center gap-2 border-t border-kumo-line px-4 py-3';
export const adminNativeControlClass =
    'h-9 w-full rounded-lg border-0 bg-kumo-control px-3 text-base text-kumo-default ring ring-kumo-line outline-none focus:ring-[1.5px] focus:ring-kumo-focus/50';
export const adminFileInputClass =
    'block w-full rounded-lg bg-kumo-control p-1 text-sm text-kumo-subtle ring ring-kumo-line file:mr-3 file:rounded-md file:border-0 file:bg-kumo-tint file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-kumo-default hover:file:bg-kumo-fill focus:outline-none focus:ring-[1.5px] focus:ring-kumo-focus/50';

export function AdminPanelHeader({
    actions,
    className,
    description,
    icon,
    title,
}: {
    readonly actions?: ReactNode;
    readonly className?: string;
    readonly description?: ReactNode;
    readonly icon?: ReactNode;
    readonly title: ReactNode;
}) {
    return (
        <header
            className={cn(
                'flex items-start justify-between gap-3 border-b border-kumo-line px-4 py-3',
                className,
            )}
        >
            <div className="flex min-w-0 items-start gap-2.5">
                {icon === undefined ? null : (
                    <span className="mt-0.5 shrink-0 text-kumo-subtle">
                        {icon}
                    </span>
                )}
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-kumo-default">
                        {title}
                    </h2>
                    {description === undefined ? null : (
                        <p className="mt-0.5 text-xs leading-5 text-kumo-subtle">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {actions === undefined ? null : (
                <div className="shrink-0">{actions}</div>
            )}
        </header>
    );
}

export function AdminNativeField({
    children,
    description,
    htmlFor,
    label,
}: {
    readonly children: ReactNode;
    readonly description?: ReactNode;
    readonly htmlFor: string;
    readonly label: ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label
                className="block text-sm font-medium text-kumo-default"
                htmlFor={htmlFor}
            >
                {label}
            </label>
            {children}
            {description === undefined ? null : (
                <p className="text-xs leading-5 text-kumo-subtle">
                    {description}
                </p>
            )}
        </div>
    );
}

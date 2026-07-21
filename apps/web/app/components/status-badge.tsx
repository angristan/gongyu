import { Badge, type BadgeVariant } from './ui';

const variants: Readonly<Record<string, BadgeVariant>> = {
    active: 'success',
    completed: 'success',
    delivered: 'success',
    expired: 'secondary',
    failed: 'error',
    needs_review: 'warning',
    paused: 'warning',
    pending: 'info',
    processing: 'info',
    queued: 'info',
    retrying: 'warning',
    running: 'info',
    waiting_metadata: 'secondary',
};

function label(value: string): string {
    return value
        .split('_')
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' ');
}

export function StatusBadge({ state }: { readonly state: string }) {
    return (
        <Badge appearance="dot" variant={variants[state] ?? 'secondary'}>
            {label(state)}
        </Badge>
    );
}

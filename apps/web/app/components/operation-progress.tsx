interface OperationProgressProps {
    readonly label: string;
    readonly processed: number;
    readonly total: number;
}

export function hasRowProgress(kind: string): boolean {
    return kind === 'import' || kind === 'restore';
}

export function artifactOperationStatus(kind: string, state: string): string {
    const operation = kind === 'backup' ? 'Backup' : 'Export';
    switch (state) {
        case 'completed':
            return `${operation} file ready to download.`;
        case 'expired':
            return `${operation} completed; its download has expired.`;
        case 'failed':
            return `${operation} failed. Review the operation errors below.`;
        case 'running':
            return `Creating ${operation.toLowerCase()} file…`;
        default:
            return `${operation} is waiting to start.`;
    }
}

export function OperationProgress({
    label,
    processed,
    total,
}: OperationProgressProps) {
    const percentage =
        total <= 0 ? 0 : Math.min(100, Math.round((processed / total) * 100));
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 text-xs">
                <span className="font-medium text-gongyu-default">{label}</span>
                <span className="text-gongyu-subtle">
                    {total <= 0 ? 'Waiting' : `${processed} / ${total}`}
                </span>
            </div>
            <div
                aria-label={label}
                aria-valuemax={Math.max(total, 1)}
                aria-valuemin={0}
                aria-valuenow={Math.min(processed, Math.max(total, 1))}
                className="h-2 overflow-hidden rounded-full bg-gongyu-fill"
                role="progressbar"
            >
                <div
                    className="h-full rounded-full bg-gongyu-brand transition-[width] duration-300"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

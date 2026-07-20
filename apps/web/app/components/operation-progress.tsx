interface OperationProgressProps {
    readonly label: string;
    readonly processed: number;
    readonly total: number;
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

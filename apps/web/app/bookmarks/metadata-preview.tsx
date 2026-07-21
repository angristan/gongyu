import { SparkleIcon } from '@phosphor-icons/react';
import { Schema } from 'effect';
import { useEffect, useRef, useState } from 'react';
import { Button, HydratedOnly } from '../components/ui';

class MetadataPreviewResponse extends Schema.Class<MetadataPreviewResponse>(
    'MetadataPreviewResponse',
)({
    description: Schema.NullOr(Schema.String),
    title: Schema.NullOr(Schema.String),
}) {}

class MetadataPreviewError extends Schema.Class<MetadataPreviewError>(
    'MetadataPreviewError',
)({
    error: Schema.Struct({ message: Schema.String }),
}) {}

export interface MetadataCandidates {
    readonly description: string | null;
    readonly title: string | null;
}

export function MetadataPreview(props: {
    readonly csrfToken: string;
    readonly onCandidates: (candidates: MetadataCandidates) => void;
    readonly url: string;
}) {
    const [message, setMessage] = useState('');
    const [processing, setProcessing] = useState(false);
    const activeRequest = useRef<AbortController | null>(null);
    const requestSequence = useRef(0);
    const latestUrl = useRef(props.url);
    const latestOnCandidates = useRef(props.onCandidates);
    latestUrl.current = props.url;
    latestOnCandidates.current = props.onCandidates;

    useEffect(() => {
        latestUrl.current = props.url;
        requestSequence.current += 1;
        activeRequest.current?.abort();
        activeRequest.current = null;
        setProcessing(false);
        setMessage('');
    }, [props.url]);

    useEffect(
        () => () => {
            requestSequence.current += 1;
            activeRequest.current?.abort();
        },
        [],
    );

    async function preview() {
        activeRequest.current?.abort();
        const controller = new AbortController();
        const requestId = requestSequence.current + 1;
        const requestedUrl = latestUrl.current;
        requestSequence.current = requestId;
        activeRequest.current = controller;
        setProcessing(true);
        setMessage('Fetching title and description…');
        try {
            const response = await fetch('/api/metadata/preview', {
                body: JSON.stringify({ url: requestedUrl }),
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': props.csrfToken,
                },
                method: 'POST',
                signal: controller.signal,
            });
            const unknownPayload: unknown = await response.json();
            if (!response.ok) {
                const error =
                    await Schema.decodeUnknownPromise(MetadataPreviewError)(
                        unknownPayload,
                    );
                throw new Error(error.error.message);
            }
            const candidates = await Schema.decodeUnknownPromise(
                MetadataPreviewResponse,
            )(unknownPayload);
            if (
                requestId !== requestSequence.current ||
                requestedUrl !== latestUrl.current
            ) {
                return;
            }
            latestOnCandidates.current(candidates);
            setMessage('Metadata candidates are ready.');
        } catch (error) {
            if (
                controller.signal.aborted ||
                requestId !== requestSequence.current
            ) {
                return;
            }
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Metadata could not be fetched. You can still save manually.',
            );
        } finally {
            if (requestId === requestSequence.current) {
                activeRequest.current = null;
                setProcessing(false);
            }
        }
    }

    return (
        <HydratedOnly>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                    className="shrink-0"
                    disabled={!props.url.startsWith('https://')}
                    icon={SparkleIcon}
                    loading={processing}
                    onClick={preview}
                    size="sm"
                    type="button"
                    variant="secondary"
                >
                    Fetch metadata
                </Button>
                <p aria-live="polite" className="text-xs text-gongyu-subtle">
                    {message === ''
                        ? 'Optionally suggest a title and description.'
                        : message}
                </p>
            </div>
        </HydratedOnly>
    );
}

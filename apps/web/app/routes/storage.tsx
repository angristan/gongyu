import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Schema } from 'effect';
import { useState } from 'react';
import { Link } from 'react-router';
import { UploadResponse, WorkflowStartResponse } from '../workflows/contracts';
import type { Route } from './+types/storage';

export function meta(): Route.MetaDescriptors {
    return [{ title: 'R2 and Workflows spike · Gongyu' }];
}

export default function StorageSpike() {
    const [file, setFile] = useState<File | null>(null);
    const [message, setMessage] = useState(
        'Choose a file up to 5 MiB to stream into private R2.',
    );
    const [processing, setProcessing] = useState(false);

    async function upload() {
        if (file === null) {
            setMessage('Choose a file first.');
            return;
        }

        setProcessing(true);
        setMessage('Streaming to R2…');
        try {
            const uploadResponse = await fetch('/api/phase0/uploads', {
                body: file,
                headers: {
                    'Content-Type':
                        file.type.length > 0
                            ? file.type
                            : 'application/octet-stream',
                },
                method: 'POST',
            });
            const uploadJson: unknown = await uploadResponse.json();
            if (!uploadResponse.ok) {
                throw new Error('The R2 upload failed.');
            }
            const upload =
                await Schema.decodeUnknownPromise(UploadResponse)(uploadJson);

            setMessage('Starting version 1 Workflow…');
            const workflowResponse = await fetch('/api/phase0/workflows', {
                body: JSON.stringify(upload.workflowPayload),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            });
            const workflowJson: unknown = await workflowResponse.json();
            if (!workflowResponse.ok) {
                throw new Error('The Workflow could not be started.');
            }
            const workflow = await Schema.decodeUnknownPromise(
                WorkflowStartResponse,
            )(workflowJson);
            setMessage(`Workflow queued: ${workflow.instanceId}`);
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'The storage spike failed.',
            );
        } finally {
            setProcessing(false);
        }
    }

    return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
            <div className="space-y-3">
                <p className="text-sm font-medium text-kumo-subtle">
                    Phase 0 · R2 and Workflows
                </p>
                <h1 className="text-4xl font-semibold text-kumo-default">
                    Stream an immutable Workflow source
                </h1>
                <p className="text-kumo-subtle">
                    The Workflow receives only a versioned R2 reference, never
                    the file body.
                </p>
            </div>

            <LayerCard>
                <div className="space-y-5 p-6">
                    <input
                        className="block w-full text-sm text-kumo-default file:mr-4 file:rounded-md file:border-0 file:bg-kumo-elevated file:px-4 file:py-2 file:text-kumo-default"
                        type="file"
                        onChange={(event) =>
                            setFile(event.currentTarget.files?.[0] ?? null)
                        }
                    />
                    <p aria-live="polite" className="text-kumo-default">
                        {message}
                    </p>
                    <Button type="button" loading={processing} onClick={upload}>
                        Upload and start Workflow
                    </Button>
                </div>
            </LayerCard>

            <Link className="text-sm text-kumo-link" to="/">
                Return to runtime status
            </Link>
        </main>
    );
}

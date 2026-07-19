import { Phase0WorkflowPayload } from '@gongyu/domain/workflows';
import { Schema } from 'effect';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/phase0-workflow';

export async function action({ context, request }: Route.ActionArgs) {
    let input: unknown;
    try {
        input = await request.json();
    } catch {
        return Response.json(
            { error: 'A valid JSON payload is required.' },
            { status: 400 },
        );
    }

    let payload: Phase0WorkflowPayload;
    try {
        payload = await Schema.decodeUnknownPromise(Phase0WorkflowPayload)(
            input,
        );
    } catch {
        return Response.json(
            { error: 'The Workflow payload must use version 1.' },
            { status: 400 },
        );
    }

    const { env } = context.get(cloudflareRequestContext);
    const instanceId = `phase0-${crypto.randomUUID()}`;
    try {
        const instance = await env.PHASE0_WORKFLOW.create({
            id: instanceId,
            params: {
                operation: payload.operation,
                source: {
                    bucket: payload.source.bucket,
                    contentType: payload.source.contentType,
                    etag: payload.source.etag,
                    key: payload.source.key,
                    size: payload.source.size,
                },
                version: payload.version,
            },
            retention: {
                errorRetention: '1 day',
                successRetention: '1 day',
            },
        });
        return Response.json(
            { instanceId: instance.id, status: 'queued' },
            { status: 202 },
        );
    } catch {
        return Response.json(
            { error: 'The Workflow instance could not be created.' },
            { status: 503 },
        );
    }
}

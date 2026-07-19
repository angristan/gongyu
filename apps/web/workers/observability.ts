import { tracing } from 'cloudflare:workers';

interface HttpTraceOptions {
    readonly method: string;
    readonly operation: () => Promise<Response>;
    readonly requestId: string;
    readonly sessionConstraint: D1SessionConstraint;
}

function errorClass(error: unknown): string {
    return error instanceof Error ? error.name : 'UnknownError';
}

export function traceHttpRequest({
    method,
    operation,
    requestId,
    sessionConstraint,
}: HttpTraceOptions): Promise<Response> {
    return tracing.enterSpan('app.http.request', async (span) => {
        const startedAt = Date.now();
        span.setAttribute('app.request_id', requestId);
        span.setAttribute('app.request_method', method);
        span.setAttribute('app.session_constraint', sessionConstraint);
        span.setAttribute('app.trigger', 'http');

        try {
            const response = await operation();
            const durationMs = Date.now() - startedAt;
            span.setAttribute('app.duration_ms', durationMs);
            span.setAttribute('app.response_status', response.status);

            console.info({
                durationMs,
                event: 'http.request.completed',
                method,
                requestId,
                sessionConstraint,
                status: response.status,
            });

            const headers = new Headers(response.headers);
            headers.set('X-Request-ID', requestId);
            return new Response(response.body, {
                headers,
                status: response.status,
                statusText: response.statusText,
            });
        } catch (error) {
            const durationMs = Date.now() - startedAt;
            const failureClass = errorClass(error);
            span.setAttribute('app.duration_ms', durationMs);
            span.setAttribute('app.error_class', failureClass);
            span.setAttribute('app.failed', true);

            console.error({
                durationMs,
                errorClass: failureClass,
                event: 'http.request.failed',
                method,
                requestId,
                sessionConstraint,
            });

            return Response.json(
                {
                    error: 'internal_error',
                    errorId: requestId,
                },
                {
                    headers: {
                        'Cache-Control': 'no-store',
                        'X-Request-ID': requestId,
                    },
                    status: 500,
                },
            );
        }
    });
}

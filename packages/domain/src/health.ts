import { Schema } from 'effect';

export class HealthResponse extends Schema.Class<HealthResponse>(
    'HealthResponse',
)({
    databaseReady: Schema.Boolean,
    environment: Schema.String,
    requestId: Schema.String,
    sessionConstraint: Schema.Union([
        Schema.Literal('first-primary'),
        Schema.Literal('first-unconstrained'),
    ]),
    status: Schema.Union([Schema.Literal('degraded'), Schema.Literal('ok')]),
}) {}

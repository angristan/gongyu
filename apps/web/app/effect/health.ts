import { D1Store } from '@gongyu/data/d1-store';
import { Effect, Schema } from 'effect';
import { RequestInfo } from './runtime';

class HealthRow extends Schema.Class<HealthRow>('HealthRow')({
    ok: Schema.Number,
}) {}

export const loadHealthStatus = Effect.fn('Health.loadStatus')(function* () {
    const request = yield* RequestInfo;
    const d1Store = yield* D1Store;
    yield* Effect.annotateCurrentSpan({
        requestId: request.requestId,
        sessionConstraint: request.sessionConstraint,
    });
    const row = yield* d1Store.first(HealthRow, 'SELECT 1 AS ok');

    return {
        databaseReady: row?.ok === 1,
        sessionConstraint: request.sessionConstraint,
    };
});

import { Context, Effect, Schema } from 'effect';

export type D1BindValue = ArrayBuffer | Uint8Array | null | number | string;

export interface D1Statement {
    readonly parameters?: ReadonlyArray<D1BindValue>;
    readonly sql: string;
}

export class D1QueryMeta extends Schema.Class<D1QueryMeta>('D1QueryMeta')({
    changes: Schema.Number,
    durationMs: Schema.Number,
    lastRowId: Schema.Number,
    rowsRead: Schema.Number,
    rowsWritten: Schema.Number,
    servedByPrimary: Schema.optionalKey(Schema.Boolean),
    servedByRegion: Schema.optionalKey(Schema.String),
    sqlDurationMs: Schema.optionalKey(Schema.Number),
    totalAttempts: Schema.optionalKey(Schema.Number),
}) {}

export interface D1QueryResult<A> {
    readonly meta: D1QueryMeta;
    readonly rows: ReadonlyArray<A>;
}

export class D1StoreError extends Schema.TaggedErrorClass<D1StoreError>()(
    'D1StoreError',
    {
        cause: Schema.Unknown,
        message: Schema.String,
        operation: Schema.String,
    },
) {}

export class D1DecodeError extends Schema.TaggedErrorClass<D1DecodeError>()(
    'D1DecodeError',
    {
        cause: Schema.Unknown,
        operation: Schema.String,
    },
) {}

export type D1StoreFailure = D1DecodeError | D1StoreError;

type RowSchema<A extends object> = Schema.Decoder<A, never>;

export class D1Store extends Context.Service<
    D1Store,
    {
        readonly batch: (
            statements: ReadonlyArray<D1Statement>,
        ) => Effect.Effect<ReadonlyArray<D1QueryMeta>, D1StoreError>;
        readonly first: <A extends object>(
            schema: RowSchema<A>,
            sql: string,
            parameters?: ReadonlyArray<D1BindValue>,
        ) => Effect.Effect<A | null, D1StoreFailure>;
        readonly getBookmark: Effect.Effect<string | null>;
        readonly query: <A extends object>(
            schema: RowSchema<A>,
            sql: string,
            parameters?: ReadonlyArray<D1BindValue>,
        ) => Effect.Effect<D1QueryResult<A>, D1StoreFailure>;
        readonly run: (
            sql: string,
            parameters?: ReadonlyArray<D1BindValue>,
        ) => Effect.Effect<D1QueryMeta, D1StoreError>;
    }
>()('@gongyu/data/D1Store') {}

function errorMessage(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

function makeStoreError(operation: string, cause: unknown): D1StoreError {
    return D1StoreError.make({
        cause,
        message: errorMessage(cause),
        operation,
    });
}

function makeMeta(meta: D1Meta): D1QueryMeta {
    return D1QueryMeta.make({
        changes: meta.changes,
        durationMs: meta.duration,
        lastRowId: meta.last_row_id,
        rowsRead: meta.rows_read,
        rowsWritten: meta.rows_written,
        ...(meta.served_by_primary === undefined
            ? {}
            : { servedByPrimary: meta.served_by_primary }),
        ...(meta.served_by_region === undefined
            ? {}
            : { servedByRegion: meta.served_by_region }),
        ...(meta.timings === undefined
            ? {}
            : { sqlDurationMs: meta.timings.sql_duration_ms }),
        ...(meta.total_attempts === undefined
            ? {}
            : { totalAttempts: meta.total_attempts }),
    });
}

function annotateMeta(meta: D1QueryMeta) {
    const attributes = {
        'db.operation.name': 'execute',
        'db.system.name': 'sqlite',
        'd1.changes': meta.changes,
        'd1.duration_ms': meta.durationMs,
        'd1.rows_read': meta.rowsRead,
        'd1.rows_written': meta.rowsWritten,
        ...(meta.servedByPrimary === undefined
            ? {}
            : { 'd1.served_by_primary': meta.servedByPrimary }),
        ...(meta.servedByRegion === undefined
            ? {}
            : { 'd1.served_by_region': meta.servedByRegion }),
        ...(meta.totalAttempts === undefined
            ? {}
            : { 'd1.total_attempts': meta.totalAttempts }),
    };

    return Effect.annotateCurrentSpan(attributes);
}

function prepareStatement(
    session: D1DatabaseSession,
    statement: D1Statement,
): D1PreparedStatement {
    const prepared = session.prepare(statement.sql);
    return statement.parameters === undefined
        ? prepared
        : prepared.bind(...statement.parameters);
}

export function makeD1Store(session: D1DatabaseSession): D1Store['Service'] {
    const query = Effect.fn('D1Store.query')(function* <A extends object>(
        schema: RowSchema<A>,
        sql: string,
        parameters: ReadonlyArray<D1BindValue> = [],
    ) {
        const result = yield* Effect.tryPromise({
            try: () =>
                session
                    .prepare(sql)
                    .bind(...parameters)
                    .all(),
            catch: (cause) => makeStoreError('query', cause),
        });
        const meta = makeMeta(result.meta);
        yield* annotateMeta(meta);
        const rows = yield* Schema.decodeUnknownEffect(Schema.Array(schema))(
            result.results,
        ).pipe(
            Effect.mapError((cause) =>
                D1DecodeError.make({ cause, operation: 'query' }),
            ),
        );

        return { meta, rows } satisfies D1QueryResult<A>;
    });

    const first = Effect.fn('D1Store.first')(function* <A extends object>(
        schema: RowSchema<A>,
        sql: string,
        parameters: ReadonlyArray<D1BindValue> = [],
    ) {
        const result = yield* query(schema, sql, parameters);
        return result.rows[0] ?? null;
    });

    const run = Effect.fn('D1Store.run')(function* (
        sql: string,
        parameters: ReadonlyArray<D1BindValue> = [],
    ) {
        const result = yield* Effect.tryPromise({
            try: () =>
                session
                    .prepare(sql)
                    .bind(...parameters)
                    .run(),
            catch: (cause) => makeStoreError('run', cause),
        });
        const meta = makeMeta(result.meta);
        yield* annotateMeta(meta);
        return meta;
    });

    const batch = Effect.fn('D1Store.batch')(function* (
        statements: ReadonlyArray<D1Statement>,
    ) {
        if (statements.length === 0) {
            return [];
        }

        const results = yield* Effect.tryPromise({
            try: () =>
                session.batch(
                    statements.map((statement) =>
                        prepareStatement(session, statement),
                    ),
                ),
            catch: (cause) => makeStoreError('batch', cause),
        });
        const metadata = results.map((result) => makeMeta(result.meta));
        const attributes = {
            'db.operation.name': 'batch',
            'db.system.name': 'sqlite',
            'd1.batch_statements': statements.length,
            'd1.rows_read': metadata.reduce(
                (total, meta) => total + meta.rowsRead,
                0,
            ),
            'd1.rows_written': metadata.reduce(
                (total, meta) => total + meta.rowsWritten,
                0,
            ),
        };
        yield* Effect.annotateCurrentSpan(attributes);
        return metadata;
    });

    return {
        batch,
        first,
        getBookmark: Effect.sync(() => session.getBookmark()),
        query,
        run,
    };
}

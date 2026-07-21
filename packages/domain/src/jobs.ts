import { Schema } from 'effect';

export class QueueJobMessage extends Schema.Class<QueueJobMessage>(
    'QueueJobMessage',
)({
    bookmarkShortUrl: Schema.String,
    jobId: Schema.String,
    kind: Schema.Union([
        Schema.Literal('metadata'),
        Schema.Literal('social'),
        Schema.Literal('thumbnail_delete'),
    ]),
    version: Schema.Literal(1),
}) {}

export class PreviewBackfillQueueMessage extends Schema.Class<PreviewBackfillQueueMessage>(
    'PreviewBackfillQueueMessage',
)({
    bookmarkShortUrl: Schema.String,
    jobId: Schema.String,
    kind: Schema.Literal('metadata'),
    operation: Schema.Literal('preview_backfill'),
    runId: Schema.String,
    version: Schema.Literal(1),
}) {}

export const BackgroundQueueMessage = Schema.Union([
    PreviewBackfillQueueMessage,
    QueueJobMessage,
]);
export type BackgroundQueueMessage = typeof BackgroundQueueMessage.Type;

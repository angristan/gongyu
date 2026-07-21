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

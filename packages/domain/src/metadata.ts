import { Schema } from 'effect';

export class MetadataCandidate extends Schema.Class<MetadataCandidate>(
    'MetadataCandidate',
)({
    description: Schema.NullOr(Schema.String),
    imageUrl: Schema.NullOr(Schema.String),
    title: Schema.NullOr(Schema.String),
}) {}

export class MetadataQueueMessage extends Schema.Class<MetadataQueueMessage>(
    'MetadataQueueMessage',
)({
    bookmarkShortUrl: Schema.String,
    jobId: Schema.String,
    kind: Schema.Literal('metadata'),
    version: Schema.Literal(1),
}) {}

export class MetadataError extends Schema.TaggedErrorClass<MetadataError>()(
    'MetadataError',
    {
        code: Schema.String,
        message: Schema.String,
        retryable: Schema.Boolean,
    },
) {}

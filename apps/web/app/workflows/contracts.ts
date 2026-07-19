import { Schema } from 'effect';

export class R2ObjectReference extends Schema.Class<R2ObjectReference>(
    'R2ObjectReference',
)({
    bucket: Schema.Literal('uploads'),
    contentType: Schema.String,
    etag: Schema.String,
    key: Schema.String,
    size: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export class Phase0WorkflowPayload extends Schema.Class<Phase0WorkflowPayload>(
    'Phase0WorkflowPayload',
)({
    operation: Schema.Literal('phase0.import'),
    source: R2ObjectReference,
    version: Schema.Literal(1),
}) {}

export class UploadResponse extends Schema.Class<UploadResponse>(
    'UploadResponse',
)({
    workflowPayload: Phase0WorkflowPayload,
}) {}

export class WorkflowStartResponse extends Schema.Class<WorkflowStartResponse>(
    'WorkflowStartResponse',
)({
    instanceId: Schema.String,
    status: Schema.Literal('queued'),
}) {}

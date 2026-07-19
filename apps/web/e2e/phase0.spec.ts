import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { Schema } from 'effect';

const execute = promisify(execFile);

const PublicKeyResponse = Schema.Struct({
    clientExtensionResults: Schema.Struct({}),
    id: Schema.String,
    rawId: Schema.String,
    type: Schema.Literal('public-key'),
});

const RegistrationVerificationRequest = Schema.Struct({
    ceremonyId: Schema.String,
    response: Schema.Struct({
        ...PublicKeyResponse.fields,
        response: Schema.Struct({
            attestationObject: Schema.String,
            clientDataJSON: Schema.String,
        }),
    }),
});

const AuthenticationVerificationRequest = Schema.Struct({
    ceremonyId: Schema.String,
    response: Schema.Struct({
        ...PublicKeyResponse.fields,
        response: Schema.Struct({
            authenticatorData: Schema.String,
            clientDataJSON: Schema.String,
            signature: Schema.String,
            userHandle: Schema.optionalKey(Schema.String),
        }),
    }),
});

const ClientData = Schema.Struct({
    challenge: Schema.String,
    crossOrigin: Schema.optionalKey(Schema.Boolean),
    origin: Schema.String,
    type: Schema.String,
});

const D1QueryResult = Schema.Array(
    Schema.Struct({
        results: Schema.Array(
            Schema.Struct({
                counter: Schema.Number,
                lastUsedAt: Schema.Number,
            }),
        ),
        success: Schema.Boolean,
    }),
);

const WorkflowPayload = Schema.Struct({
    operation: Schema.Literal('phase0.import'),
    source: Schema.Struct({
        bucket: Schema.Literal('uploads'),
        contentType: Schema.String,
        etag: Schema.String,
        key: Schema.String,
        size: Schema.Number,
    }),
    version: Schema.Literal(1),
});
const UploadResponse = Schema.Struct({
    workflowPayload: WorkflowPayload,
});
const WorkflowStartResponse = Schema.Struct({
    instanceId: Schema.String,
    status: Schema.Literal('queued'),
});
const WorkflowQueryResult = Schema.Array(
    Schema.Struct({
        results: Schema.Array(
            Schema.Struct({
                instanceId: Schema.String,
                objectKey: Schema.String,
                status: Schema.String,
            }),
        ),
        success: Schema.Boolean,
    }),
);

test('enforces one discoverable passkey and updates its counter', async ({
    context,
    page,
}) => {
    const client = await context.newCDPSession(page);
    await client.send('WebAuthn.enable');
    const { authenticatorId } = await client.send(
        'WebAuthn.addVirtualAuthenticator',
        {
            options: {
                automaticPresenceSimulation: true,
                hasResidentKey: true,
                hasUserVerification: true,
                isUserVerified: true,
                protocol: 'ctap2',
                transport: 'internal',
            },
        },
    );

    await page.goto('/passkey');
    await page.route(
        '**/api/passkey/registration/verify',
        async (route) => {
            const payload: unknown = JSON.parse(
                route.request().postData() ?? 'null',
            );
            const request = await Schema.decodeUnknownPromise(
                RegistrationVerificationRequest,
            )(payload);
            const clientData = await Schema.decodeUnknownPromise(ClientData)(
                JSON.parse(
                    Buffer.from(
                        request.response.response.clientDataJSON,
                        'base64url',
                    ).toString('utf8'),
                ),
            );
            await route.continue({
                postData: JSON.stringify({
                    ...request,
                    response: {
                        ...request.response,
                        response: {
                            ...request.response.response,
                            clientDataJSON: Buffer.from(
                                JSON.stringify({
                                    ...clientData,
                                    origin: 'https://wrong-origin.test',
                                }),
                            ).toString('base64url'),
                        },
                    },
                }),
            });
        },
        { times: 1 },
    );
    await page.getByRole('button', { name: 'Register passkey' }).click();
    await expect(
        page.getByText('Passkey registration could not be verified.'),
    ).toBeVisible();
    const { credentials } = await client.send('WebAuthn.getCredentials', {
        authenticatorId,
    });
    for (const credential of credentials) {
        await client.send('WebAuthn.removeCredential', {
            authenticatorId,
            credentialId: credential.credentialId,
        });
    }

    await page.getByRole('button', { name: 'Register passkey' }).click();
    await expect(
        page.getByText('Passkey registered successfully.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Register passkey' }).click();
    await expect(
        page.getByText('A passkey is already registered.'),
    ).toBeVisible();

    await page.route(
        '**/api/passkey/authentication/verify',
        async (route) => {
            const payload: unknown = JSON.parse(
                route.request().postData() ?? 'null',
            );
            const request = await Schema.decodeUnknownPromise(
                AuthenticationVerificationRequest,
            )(payload);
            await route.continue({
                postData: JSON.stringify({
                    ...request,
                    response: {
                        ...request.response,
                        id: 'dW5rbm93bg',
                        rawId: 'dW5rbm93bg',
                    },
                }),
            });
        },
        { times: 1 },
    );
    await page.getByRole('button', { name: 'Authenticate' }).click();
    await expect(
        page.getByText('No matching passkey is registered.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Authenticate' }).click();
    await expect(
        page.getByText('Passkey authentication succeeded.'),
    ).toBeVisible();

    const { stdout } = await execute('bunx', [
        'wrangler',
        'd1',
        'execute',
        'gongyu-phase0-local',
        '--local',
        '--json',
        '--command=SELECT counter, last_used_at AS lastUsedAt FROM phase0_passkey',
    ]);
    const query = await Schema.decodeUnknownPromise(D1QueryResult)(
        JSON.parse(stdout),
    );
    expect(query[0]?.success).toBe(true);
    expect(query[0]?.results[0]?.counter).toBeGreaterThan(0);
    expect(query[0]?.results[0]?.lastUsedAt).toBeGreaterThan(0);
});

test('streams an R2 upload into a version 1 Workflow', async ({ request }) => {
    const source = '{"bookmarks":[{"title":"Gongyu"}]}';
    const uploadResponse = await request.post('/api/phase0/uploads', {
        data: source,
        headers: { 'Content-Type': 'application/json' },
    });
    expect(uploadResponse.status()).toBe(201);
    const upload = await Schema.decodeUnknownPromise(UploadResponse)(
        await uploadResponse.json(),
    );
    expect(upload.workflowPayload.source.size).toBe(Buffer.byteLength(source));
    expect(upload.workflowPayload.source.key).toMatch(/^phase0\/uploads\//);

    const workflowResponse = await request.post('/api/phase0/workflows', {
        data: upload.workflowPayload,
    });
    expect(workflowResponse.status()).toBe(202);
    const workflow = await Schema.decodeUnknownPromise(WorkflowStartResponse)(
        await workflowResponse.json(),
    );

    await expect
        .poll(
            async () => {
                const { stdout } = await execute('bunx', [
                    'wrangler',
                    'd1',
                    'execute',
                    'gongyu-phase0-local',
                    '--local',
                    '--json',
                    '--command=SELECT instance_id AS instanceId, object_key AS objectKey, status FROM phase0_workflow_runs',
                ]);
                const query = await Schema.decodeUnknownPromise(
                    WorkflowQueryResult,
                )(JSON.parse(stdout));
                return query[0]?.results.find(
                    (row) => row.instanceId === workflow.instanceId,
                );
            },
            { timeout: 20_000 },
        )
        .toEqual({
            instanceId: workflow.instanceId,
            objectKey: upload.workflowPayload.source.key,
            status: 'complete',
        });
});

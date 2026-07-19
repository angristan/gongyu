import { Schema } from 'effect';

const PublicKeyCredentialType = Schema.Literal('public-key');
const AuthenticatorAttachment = Schema.Union([
    Schema.Literal('cross-platform'),
    Schema.Literal('platform'),
]);

const PublicKeyCredentialParameter = Schema.Struct({
    alg: Schema.Number,
    type: PublicKeyCredentialType,
});

const AuthenticatorSelection = Schema.Struct({
    authenticatorAttachment: Schema.optionalKey(AuthenticatorAttachment),
    requireResidentKey: Schema.optionalKey(Schema.Boolean),
    residentKey: Schema.optionalKey(
        Schema.Union([
            Schema.Literal('discouraged'),
            Schema.Literal('preferred'),
            Schema.Literal('required'),
        ]),
    ),
    userVerification: Schema.optionalKey(
        Schema.Union([
            Schema.Literal('discouraged'),
            Schema.Literal('preferred'),
            Schema.Literal('required'),
        ]),
    ),
});

export class RegistrationOptions extends Schema.Class<RegistrationOptions>(
    'RegistrationOptions',
)({
    attestation: Schema.optionalKey(
        Schema.Union([
            Schema.Literal('direct'),
            Schema.Literal('enterprise'),
            Schema.Literal('none'),
        ]),
    ),
    authenticatorSelection: Schema.optionalKey(AuthenticatorSelection),
    challenge: Schema.String,
    pubKeyCredParams: Schema.mutable(
        Schema.Array(PublicKeyCredentialParameter),
    ),
    rp: Schema.Struct({
        id: Schema.optionalKey(Schema.String),
        name: Schema.String,
    }),
    timeout: Schema.optionalKey(Schema.Number),
    user: Schema.Struct({
        displayName: Schema.String,
        id: Schema.String,
        name: Schema.String,
    }),
}) {}

export class AuthenticationOptions extends Schema.Class<AuthenticationOptions>(
    'AuthenticationOptions',
)({
    challenge: Schema.String,
    rpId: Schema.optionalKey(Schema.String),
    timeout: Schema.optionalKey(Schema.Number),
    userVerification: Schema.optionalKey(
        Schema.Union([
            Schema.Literal('discouraged'),
            Schema.Literal('preferred'),
            Schema.Literal('required'),
        ]),
    ),
}) {}

export class RegistrationResponse extends Schema.Class<RegistrationResponse>(
    'RegistrationResponse',
)({
    authenticatorAttachment: Schema.optionalKey(AuthenticatorAttachment),
    clientExtensionResults: Schema.Struct({}),
    id: Schema.String,
    rawId: Schema.String,
    response: Schema.Struct({
        attestationObject: Schema.String,
        clientDataJSON: Schema.String,
        transports: Schema.optionalKey(
            Schema.mutable(
                Schema.Array(
                    Schema.Union([
                        Schema.Literal('ble'),
                        Schema.Literal('cable'),
                        Schema.Literal('hybrid'),
                        Schema.Literal('internal'),
                        Schema.Literal('nfc'),
                        Schema.Literal('smart-card'),
                        Schema.Literal('usb'),
                    ]),
                ),
            ),
        ),
    }),
    type: PublicKeyCredentialType,
}) {}

export class AuthenticationResponse extends Schema.Class<AuthenticationResponse>(
    'AuthenticationResponse',
)({
    authenticatorAttachment: Schema.optionalKey(AuthenticatorAttachment),
    clientExtensionResults: Schema.Struct({}),
    id: Schema.String,
    rawId: Schema.String,
    response: Schema.Struct({
        authenticatorData: Schema.String,
        clientDataJSON: Schema.String,
        signature: Schema.String,
        userHandle: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
    type: PublicKeyCredentialType,
}) {}

export class RegistrationOptionsEnvelope extends Schema.Class<RegistrationOptionsEnvelope>(
    'RegistrationOptionsEnvelope',
)({
    ceremonyId: Schema.String,
    options: RegistrationOptions,
}) {}

export class AuthenticationOptionsEnvelope extends Schema.Class<AuthenticationOptionsEnvelope>(
    'AuthenticationOptionsEnvelope',
)({
    ceremonyId: Schema.String,
    options: AuthenticationOptions,
}) {}

export class RegistrationVerificationRequest extends Schema.Class<RegistrationVerificationRequest>(
    'RegistrationVerificationRequest',
)({
    ceremonyId: Schema.String,
    response: RegistrationResponse,
}) {}

export class AuthenticationVerificationRequest extends Schema.Class<AuthenticationVerificationRequest>(
    'AuthenticationVerificationRequest',
)({
    ceremonyId: Schema.String,
    response: AuthenticationResponse,
}) {}

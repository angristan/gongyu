import { Schema } from 'effect';

export const DEFAULT_LIBRARY_NAME = 'Gongyu';

export const TwitterDeliveryMode = Schema.Union([
    Schema.Literal('api'),
    Schema.Literal('manual'),
    Schema.Literal('disabled'),
]);
export type TwitterDeliveryMode = typeof TwitterDeliveryMode.Type;

export class Settings extends Schema.Class<Settings>('Settings')({
    blueskyAppPassword: Schema.String,
    blueskyHandle: Schema.String,
    feedCount: Schema.Number,
    libraryName: Schema.String,
    mastodonAccessToken: Schema.String,
    mastodonInstance: Schema.String,
    twitterAccessSecret: Schema.String,
    twitterAccessToken: Schema.String,
    twitterApiKey: Schema.String,
    twitterApiSecret: Schema.String,
    twitterDeliveryMode: TwitterDeliveryMode,
}) {}

export class SettingsValidationError extends Schema.TaggedErrorClass<SettingsValidationError>()(
    'SettingsValidationError',
    {
        field: Schema.String,
        message: Schema.String,
    },
) {}

import { Schema } from 'effect';

export const DEFAULT_LIBRARY_NAME = 'Gongyu';

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
}) {}

export class SettingsValidationError extends Schema.TaggedErrorClass<SettingsValidationError>()(
    'SettingsValidationError',
    {
        field: Schema.String,
        message: Schema.String,
    },
) {}

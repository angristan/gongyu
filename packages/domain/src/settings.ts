import { Schema } from 'effect';

export class Settings extends Schema.Class<Settings>('Settings')({
    blueskyAppPassword: Schema.String,
    blueskyHandle: Schema.String,
    feedCount: Schema.Number,
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

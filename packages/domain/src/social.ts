import { Effect, Schema } from 'effect';
import type { Settings } from './settings';

export const SocialProvider = Schema.Union([
    Schema.Literal('twitter'),
    Schema.Literal('mastodon'),
    Schema.Literal('bluesky'),
]);
export type SocialProvider = typeof SocialProvider.Type;

export class SocialSourceSnapshot extends Schema.Class<SocialSourceSnapshot>(
    'SocialSourceSnapshot',
)({
    description: Schema.NullOr(Schema.String),
    originalUrl: Schema.String,
    schemaVersion: Schema.Literal(1),
    shortUrl: Schema.String,
    title: Schema.String,
}) {}

export class SocialPayloadSnapshot extends Schema.Class<SocialPayloadSnapshot>(
    'SocialPayloadSnapshot',
)({
    blueskyByteEnd: Schema.NullOr(Schema.Number),
    blueskyByteStart: Schema.NullOr(Schema.Number),
    blueskyCreatedAt: Schema.NullOr(Schema.String),
    description: Schema.String,
    finalizedAt: Schema.Number,
    formattedText: Schema.String,
    originalUrl: Schema.String,
    r2ThumbnailKey: Schema.NullOr(Schema.String),
    schemaVersion: Schema.Literal(1),
    shortUrl: Schema.String,
    title: Schema.String,
}) {}

export class SocialQueueMessage extends Schema.Class<SocialQueueMessage>(
    'SocialQueueMessage',
)({
    deliveryId: Schema.String,
    formattingVersion: Schema.Literal(1),
    kind: Schema.Literal('social-delivery'),
    version: Schema.Literal(1),
}) {}

export class SocialPayloadError extends Schema.TaggedErrorClass<SocialPayloadError>()(
    'SocialPayloadError',
    {
        code: Schema.String,
        provider: SocialProvider,
    },
) {}

export function configuredProviders(settings: Settings): SocialProvider[] {
    const providers: SocialProvider[] = [];
    if (
        settings.twitterApiKey.trim() !== '' &&
        settings.twitterApiSecret.trim() !== '' &&
        settings.twitterAccessToken.trim() !== '' &&
        settings.twitterAccessSecret.trim() !== ''
    ) {
        providers.push('twitter');
    }
    if (
        settings.mastodonInstance.trim() !== '' &&
        settings.mastodonAccessToken.trim() !== ''
    ) {
        providers.push('mastodon');
    }
    if (
        settings.blueskyHandle.trim() !== '' &&
        settings.blueskyAppPassword.trim() !== ''
    ) {
        providers.push('bluesky');
    }
    return providers;
}

function truncateTitle(title: string, budget: number): string {
    const points = Array.from(title);
    return points.length <= budget
        ? title
        : `${points.slice(0, Math.max(0, budget - 1)).join('')}…`;
}

export const formatSocialPayload = Effect.fn('Social.formatPayload')(
    function* (input: {
        readonly description: string;
        readonly finalizedAt: number;
        readonly originalUrl: string;
        readonly provider: SocialProvider;
        readonly r2ThumbnailKey: string | null;
        readonly shortUrl: string;
        readonly title: string;
    }) {
        const maximum =
            input.provider === 'twitter'
                ? 280
                : input.provider === 'mastodon'
                  ? 500
                  : 300;
        const urlWeight =
            input.provider === 'twitter'
                ? 23
                : Array.from(input.originalUrl).length;
        const titleBudget = maximum - urlWeight - 1;
        if (titleBudget < 1) {
            return yield* SocialPayloadError.make({
                code: 'payload_too_long',
                provider: input.provider,
            });
        }
        const formattedTitle = truncateTitle(input.title, titleBudget);
        const formattedText = `${formattedTitle} ${input.originalUrl}`;
        const prefixBytes = new TextEncoder().encode(
            `${formattedTitle} `,
        ).byteLength;
        const urlBytes = new TextEncoder().encode(input.originalUrl).byteLength;

        return SocialPayloadSnapshot.make({
            blueskyByteEnd:
                input.provider === 'bluesky' ? prefixBytes + urlBytes : null,
            blueskyByteStart: input.provider === 'bluesky' ? prefixBytes : null,
            blueskyCreatedAt:
                input.provider === 'bluesky'
                    ? new Date(
                          Math.floor(input.finalizedAt / 1_000),
                      ).toISOString()
                    : null,
            description: input.description,
            finalizedAt: input.finalizedAt,
            formattedText,
            originalUrl: input.originalUrl,
            r2ThumbnailKey: input.r2ThumbnailKey,
            schemaVersion: 1,
            shortUrl: input.shortUrl,
            title: input.title,
        });
    },
);

import { assert, it } from '@effect/vitest';
import { parseShaarliDatastore } from '@gongyu/integrations/shaarli-datastore';
import { Effect } from 'effect';

const fixture =
    '<?php /* jY/NrsIgEIXfZR7AAq16PV2qaxfGtaFAIrGVBtCYmL67g7rxrtyQwznz880Of6CU7brXKREkHgkrUBfCedDxnKjVUHh4CBaLkiqQt9R6NKpNqEHX2BMrJUGnnMeEqnJ3PYy9m5kwVLqEc1D2uXdFL0Hbd15+ktusSyb6MftwKVYD2rDzqTXR6ezsq5bHKKHmQgp55EeJutjlglOI+fAGWYB0Z6TibPKQzN18c9c/cXf/uXnu3plwsR+wMfobk1Hb8ZJpmp4= */ ?>';

it.effect('decodes anonymized base64 raw-deflate PHP Shaarli data', () =>
    Effect.gen(function* () {
        const decoded = yield* parseShaarliDatastore(fixture, 1);
        assert.lengthOf(decoded.bookmarks, 2);
        assert.strictEqual(decoded.bookmarks[0].id, 42);
        assert.strictEqual(decoded.bookmarks[0].url, 'https://example.com/a');
        assert.strictEqual(decoded.bookmarks[0].shaarliShortUrl, 'abc123');
        assert.strictEqual(
            decoded.bookmarks[0].createdAt,
            1_735_693_323_000_000,
        );
    }),
);

it.effect('fails closed for malformed serialized data', () =>
    Effect.gen(function* () {
        const failure = yield* parseShaarliDatastore(
            '<?php /* not-base64 */ ?>',
            1,
        ).pipe(Effect.flip);
        assert.strictEqual(failure.code, 'invalid_datastore');
    }),
);

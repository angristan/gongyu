import {
    isSafeBookmarkUrl,
    type ParseResult,
    PortabilityError,
    PortableBookmark,
    timestampToMicros,
} from '@gongyu/domain/portability';
import { Effect } from 'effect';

const OUTPUT_LIMIT_BYTES = 10 * 1_024 * 1_024;

type PhpValue =
    | null
    | boolean
    | number
    | string
    | PhpValue[]
    | {
          readonly className: string;
          readonly properties: Map<string, PhpValue>;
      };

class PhpParser {
    private offset = 0;

    public constructor(private readonly bytes: Uint8Array) {}

    public parse(): PhpValue {
        const value = this.readValue();
        if (this.offset !== this.bytes.length) {
            throw new Error('Trailing PHP serialization data.');
        }
        return value;
    }

    private byte(): number {
        const value = this.bytes[this.offset];
        if (value === undefined) {
            throw new Error('Unexpected end of PHP serialization.');
        }
        this.offset += 1;
        return value;
    }

    private expect(value: string): void {
        for (const expected of new TextEncoder().encode(value)) {
            if (this.byte() !== expected) {
                throw new Error('Invalid PHP serialization token.');
            }
        }
    }

    private readUntil(delimiter: number): string {
        const start = this.offset;
        while (this.bytes[this.offset] !== delimiter) {
            if (this.offset >= this.bytes.length) {
                throw new Error('Unterminated PHP serialization value.');
            }
            this.offset += 1;
        }
        const value = new TextDecoder().decode(
            this.bytes.slice(start, this.offset),
        );
        this.offset += 1;
        return value;
    }

    private readString(): string {
        this.expect(':');
        const length = Number.parseInt(this.readUntil(0x3a), 10);
        this.expect('"');
        const start = this.offset;
        this.offset += length;
        if (
            !Number.isSafeInteger(length) ||
            length < 0 ||
            this.offset > this.bytes.length
        ) {
            throw new Error('Invalid PHP string length.');
        }
        const value = new TextDecoder().decode(
            this.bytes.slice(start, this.offset),
        );
        this.expect('";');
        return value;
    }

    private readArray():
        | PhpValue[]
        | {
              readonly className: string;
              readonly properties: Map<string, PhpValue>;
          } {
        this.expect(':');
        const count = Number.parseInt(this.readUntil(0x3a), 10);
        this.expect('{');
        const values: Array<[PhpValue, PhpValue]> = [];
        for (let index = 0; index < count; index += 1) {
            values.push([this.readValue(), this.readValue()]);
        }
        this.expect('}');
        const numeric = values.every(
            ([key], index) => typeof key === 'number' && key === index,
        );
        if (numeric) {
            return values.map(([, value]) => value);
        }
        return {
            className: '__array__',
            properties: new Map(
                values.map(([key, value]) => [String(key), value]),
            ),
        };
    }

    private readObject(): PhpValue {
        this.expect(':');
        const classLength = Number.parseInt(this.readUntil(0x3a), 10);
        this.expect('"');
        const classStart = this.offset;
        this.offset += classLength;
        const className = new TextDecoder().decode(
            this.bytes.slice(classStart, this.offset),
        );
        this.expect('":');
        const count = Number.parseInt(this.readUntil(0x3a), 10);
        this.expect('{');
        const properties = new Map<string, PhpValue>();
        for (let index = 0; index < count; index += 1) {
            const key = this.readValue();
            properties.set(String(key), this.readValue());
        }
        this.expect('}');
        return { className, properties };
    }

    private readValue(): PhpValue {
        const token = String.fromCharCode(this.byte());
        if (token === 'N') {
            this.expect(';');
            return null;
        }
        if (token === 'b') {
            this.expect(':');
            return this.readUntil(0x3b) === '1';
        }
        if (token === 'i' || token === 'd') {
            this.expect(':');
            return Number(this.readUntil(0x3b));
        }
        if (token === 's') {
            return this.readString();
        }
        if (token === 'a') {
            return this.readArray();
        }
        if (token === 'O') {
            return this.readObject();
        }
        throw new Error(`Unsupported PHP serialization token: ${token}`);
    }
}

function properties(value: PhpValue): Map<string, PhpValue> | null {
    return typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        'properties' in value
        ? value.properties
        : null;
}

function normalizedKey(value: string): string {
    return (
        value.replaceAll('\0', '').replace(/^\*/u, '').split('\\').at(-1) ??
        value
    );
}

function property(map: Map<string, PhpValue>, name: string): PhpValue {
    for (const [key, value] of map) {
        if (normalizedKey(key).endsWith(name)) {
            return value;
        }
    }
    return null;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Response(bytes.slice().buffer as ArrayBuffer).body;
    if (stream === null) {
        throw new Error('Unable to read datastore bytes.');
    }
    const decompressed = stream.pipeThrough(
        new DecompressionStream('deflate-raw' as 'deflate'),
    );
    const reader = decompressed.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const result = await reader.read();
        if (result.done) {
            break;
        }
        size += result.value.byteLength;
        if (size > OUTPUT_LIMIT_BYTES) {
            await reader.cancel();
            throw new Error('Datastore decompressed output is too large.');
        }
        chunks.push(result.value);
    }
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return output;
}

function decodeBase64(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export const parseShaarliDatastore = Effect.fn('ShaarliDatastore.parse')(
    function* (content: string, fallbackNow: number) {
        const prefix = '<?php /* ';
        if (!content.startsWith(prefix)) {
            return yield* PortabilityError.make({
                code: 'invalid_datastore',
                message: 'Invalid datastore format: missing PHP prefix.',
            });
        }
        let encoded = content.slice(prefix.length);
        if (encoded.endsWith(' */ ?>')) {
            encoded = encoded.slice(0, -6);
        } else if (encoded.endsWith(' */')) {
            encoded = encoded.slice(0, -3);
        }
        const root = yield* Effect.tryPromise({
            try: async () => {
                const compressed = decodeBase64(encoded);
                const serialized = await inflateRaw(compressed);
                return new PhpParser(serialized).parse();
            },
            catch: () =>
                PortabilityError.make({
                    code: 'invalid_datastore',
                    message: 'Invalid Shaarli datastore encoding.',
                }),
        });
        const rootProperties = properties(root);
        if (rootProperties === null) {
            return yield* PortabilityError.make({
                code: 'invalid_datastore',
                message: 'Could not find bookmarks in datastore.',
            });
        }
        const bookmarkValue = property(rootProperties, 'bookmarks');
        const values = Array.isArray(bookmarkValue)
            ? bookmarkValue
            : properties(bookmarkValue) === null
              ? []
              : Array.from(properties(bookmarkValue)?.values() ?? []);
        const bookmarks: PortableBookmark[] = [];
        const errors: ParseResult['errors'][number][] = [];
        for (const [rowIndex, value] of values.entries()) {
            const row = properties(value);
            const url = row === null ? null : property(row, 'url');
            if (typeof url !== 'string' || url === '') {
                errors.push({
                    code: 'missing_url',
                    message: 'Bookmark is missing its URL.',
                    rowIndex,
                });
                continue;
            }
            if (!isSafeBookmarkUrl(url)) {
                errors.push({
                    code: 'invalid_url',
                    message:
                        'Bookmark URL must use HTTP or HTTPS without credentials.',
                    rowIndex,
                });
                continue;
            }
            const created = row === null ? null : property(row, 'created');
            const updated = row === null ? null : property(row, 'updated');
            const dateValue = (value: PhpValue): unknown => {
                if (typeof value === 'string' || typeof value === 'number') {
                    return value;
                }
                const dateProperties = properties(value);
                return dateProperties === null
                    ? null
                    : property(dateProperties, 'date');
            };
            const createdAt = timestampToMicros(
                dateValue(created),
                fallbackNow,
            );
            const id = row === null ? null : property(row, 'id');
            const title = row === null ? null : property(row, 'title');
            const description =
                row === null ? null : property(row, 'description');
            const shortUrl = row === null ? null : property(row, 'shortUrl');
            bookmarks.push(
                PortableBookmark.make({
                    createdAt,
                    description:
                        typeof description === 'string' && description !== ''
                            ? description
                            : null,
                    id:
                        typeof id === 'number' &&
                        Number.isSafeInteger(id) &&
                        id > 0
                            ? id
                            : null,
                    shaarliShortUrl:
                        typeof shortUrl === 'string' && shortUrl !== ''
                            ? shortUrl
                            : null,
                    shortUrl: null,
                    thumbnailUrl: null,
                    title:
                        typeof title === 'string' && title !== '' ? title : url,
                    updatedAt: timestampToMicros(dateValue(updated), createdAt),
                    url,
                }),
            );
        }
        return { bookmarks, errors } satisfies ParseResult;
    },
);

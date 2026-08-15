export const PUBLIC_CACHE_TAG = 'gongyu-public';

export async function purgePublicWorkerCache(
    cacheContext: CacheContext | undefined,
): Promise<void> {
    if (cacheContext === undefined) {
        return;
    }

    try {
        const result = await cacheContext.purge({ tags: [PUBLIC_CACHE_TAG] });
        if (!result.success) {
            console.error(
                JSON.stringify({
                    errorCodes: result.errors.map(({ code }) => code),
                    event: 'public_cache.purge.failed',
                }),
            );
        }
    } catch (error) {
        console.error(
            JSON.stringify({
                errorClass:
                    error instanceof Error
                        ? error.constructor.name
                        : 'UnknownError',
                event: 'public_cache.purge.failed',
            }),
        );
    }
}

import { createLegacyMigrationBackup } from '../src/legacy-migration';

const LEGACY_EXPORT_SQL = `
SELECT json_build_object(
    'version', 1,
    'exported_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'bookmarks', COALESCE((
        SELECT json_agg(json_build_object(
            'id', id,
            'short_url', short_url,
            'shaarli_short_url', shaarli_short_url,
            'url', url,
            'title', title,
            'description', description,
            'thumbnail_url', thumbnail_url,
            'created_at', to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'updated_at', to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        ) ORDER BY id)
        FROM bookmarks
    ), '[]'::json),
    'settings', COALESCE((
        SELECT json_agg(json_build_object(
            'key', key,
            'value', value,
            'encrypted', encrypted,
            'updated_at', to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        ) ORDER BY key)
        FROM settings
    ), '[]'::json)
)::text;
`;

function requiredEnvironment(name: string): string {
    const value = Bun.env[name];
    if (value === undefined || value === '') {
        throw new Error(`${name} is required.`);
    }
    return value;
}

async function sourceJson(path: string | undefined): Promise<unknown> {
    if (path !== undefined) {
        return Bun.file(path).json();
    }
    const process = Bun.spawn(
        ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-Atc', LEGACY_EXPORT_SQL],
        {
            env: Bun.env,
            stderr: 'inherit',
            stdout: 'pipe',
        },
    );
    const output = await new Response(process.stdout).text();
    const exitCode = await process.exited;
    if (exitCode !== 0) {
        throw new Error(`psql exited with status ${exitCode}.`);
    }
    return JSON.parse(output) as unknown;
}

if (Bun.argv.includes('--help')) {
    console.log(`Usage: bun apps/jobs/scripts/migrate-legacy.ts OUTPUT [SOURCE_JSON]

Without SOURCE_JSON, psql reads the PostgreSQL connection from standard PG* environment variables (including DATABASE_URL).
Required environment: LEGACY_APP_KEY, ENCRYPTION_KEYS, DESTINATION_RP_ID.
The output is a validated Gongyu full-backup JSON file suitable for a replacement restore.`);
    process.exit(0);
}

const outputPath = Bun.argv[2];
if (outputPath === undefined) {
    throw new Error('An output path is required. Run with --help for usage.');
}
const source = await sourceJson(Bun.argv[3]);
const backup = await createLegacyMigrationBackup({
    destinationKeyring: requiredEnvironment('ENCRYPTION_KEYS'),
    destinationRpId: requiredEnvironment('DESTINATION_RP_ID'),
    legacyAppKey: requiredEnvironment('LEGACY_APP_KEY'),
    source,
});
await Bun.write(outputPath, JSON.stringify(backup));
console.log(
    JSON.stringify({
        bookmarks: backup.bookmarks.length,
        dataSha256: backup.dataSha256,
        outputPath,
        settings: backup.settings.length,
    }),
);

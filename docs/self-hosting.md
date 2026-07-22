# Self-hosting on Cloudflare

Gongyu runs as one Cloudflare Worker. It is not a container or VPS application.

## Requirements

- A Cloudflare account with a Workers plan that supports Workflows
- Bun 1.3.9
- Wrangler authentication: `bunx wrangler login`
- A final HTTPS hostname for the Worker before passkey enrollment

The checked-in Wrangler file contains the maintainers' production environment. Treat it as a template: replace all Worker, D1, R2, Queue, Workflow, hostname, and account-specific values before deploying a separate installation.

## 1. Install and provision resources

```bash
bun install --frozen-lockfile

bunx wrangler d1 create gongyu
bunx wrangler r2 bucket create gongyu-uploads
bunx wrangler queues create gongyu-jobs
bunx wrangler queues create gongyu-jobs-dlq
```

Update `apps/web/wrangler.jsonc` with the D1 database, R2 bucket, Queue producer, Queue consumers, dead-letter queue, cron, and Workflow bindings.

Use unique names for:

- the Worker;
- the data Workflow;
- D1 and R2 resources;
- the main queue and dead-letter queue.

The Workflow is implemented by the same Worker, so its binding must not use `script_name`.

## 2. Configure the hostname

Set these Worker variables for the deployment environment:

| Variable | Value |
| --- | --- |
| `APP_ENV` | An environment label such as `production` |
| `RP_ID` | The exact hostname, without scheme or port |
| `RP_ORIGIN` | The exact HTTPS origin, without a trailing slash |

Configure the Worker's custom domain or `workers.dev` hostname to match.

Passkeys are bound to `RP_ID`. Changing it later requires passkey recovery or re-enrollment, so choose the final hostname first.

## 3. Configure secrets

Generate a 32-byte AES-GCM keyring and a bootstrap token locally:

```bash
bun -e 'const key=crypto.getRandomValues(new Uint8Array(32)); console.log(JSON.stringify({currentVersion:1,keys:{"1":Buffer.from(key).toString("base64")}}))'
bun -e 'console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"))'
```

Store the first output as `ENCRYPTION_KEYS` and the second as `SETUP_TOKEN` on the Worker. Wrangler prompts for each value without placing it in the command line:

```bash
bunx wrangler secret put ENCRYPTION_KEYS --env production --config apps/web/wrangler.jsonc
bunx wrangler secret put SETUP_TOKEN --env production --config apps/web/wrangler.jsonc
```

Replace `production` if you created a differently named environment. Keep the keyring outside the repository and back it up securely. Losing it makes encrypted social credentials and restored settings unreadable.

## 4. Validate and deploy

Validate, apply D1 migrations, and deploy:

```bash
bun run check
bun run deploy:production
```

The root deployment script applies production D1 migrations first, then builds and deploys the Worker. For another environment, add equivalent environment bindings and migration-first scripts.

## 5. Enroll the administrator

Visit `https://your-host/setup`, enter `SETUP_TOKEN`, and register the administrator passkey. Setup closes after a passkey exists.

Use a passkey that is backed up or available on more than one trusted device. Recovery requires Cloudflare deployment access and rotating the bootstrap token.

Configure social providers and the public feed from **Admin → Settings**. Provider credentials are encrypted in D1 with `ENCRYPTION_KEYS`.

## Updating

```bash
git pull --ff-only
bun install --frozen-lockfile
bun run check
bun run deploy:production
```

Never edit an applied migration. Add a new numbered SQL migration under `migrations/` and apply it before code that depends on it.

### Rollback

Keep the previous Worker compatible with every newly applied migration; rolling back a Worker does not roll back D1, Queue payloads, Workflow state, or R2 data. For an application-only regression, use the project-pinned Wrangler to list deployments and roll back the production Worker, then verify `/health`, sign-in, one public bookmark, and the Admin Jobs page. Recover corrupted data through a tested application backup or the current D1 Time Travel procedure, never by reversing an applied migration in place.

Record the Worker version, migration state, in-flight Queue and Workflow versions, recovery point, and smoke-test results before reopening writes.

## Operations

Health check:

```text
https://your-host/health
```

Tail the Worker:

```bash
bunx wrangler tail --env production --config apps/web/wrangler.jsonc
```

The Worker's background entrypoints consume queue messages, run Workflow classes, dispatch the D1 outbox every minute, and clean expired sessions, jobs, audit events, and generated artifacts. Inspect Cloudflare Queues and **Admin → Jobs** when background work repeatedly fails.

A primary-queue message reaches the DLQ only after bounded redelivery. The DLQ consumer records the corresponding job as failed before acknowledging it. If that persistence attempt fails, leave the message for its configured retry; after the retry cap, use the job and outbox state in D1 to identify work that still lacks a terminal result. Correct the underlying configuration or provider failure, then use the Admin Jobs retry action rather than copying or editing Queue payloads manually. Keep old payload decoders deployed until both the primary queue and DLQ no longer contain that version.

Imports, exports, backups, restores, and job status are available under **Admin → Data** and **Admin → Jobs**. Generated data artifacts are private and expire; download anything you need to retain.

## Migrating a legacy installation

The migration utility converts a legacy PostgreSQL export or an existing source JSON file into a validated Gongyu full-backup JSON file:

```bash
LEGACY_APP_KEY='...' \
ENCRYPTION_KEYS='...' \
DESTINATION_RP_ID='your-host' \
bun apps/jobs/scripts/migrate-legacy.ts output.json [source.json]
```

Without `source.json`, the script invokes `psql` and reads standard PostgreSQL connection variables, including `DATABASE_URL`. Restore the resulting file from **Admin → Data**. Test this flow against a non-production deployment before any cutover.

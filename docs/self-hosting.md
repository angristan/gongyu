# Self-hosting on Cloudflare

Gongyu runs as two Cloudflare Workers. It is not a container or VPS application.

## Requirements

- A Cloudflare account with a Workers plan that supports Workflows
- Bun 1.3.9
- Wrangler authentication: `bunx wrangler login`
- A final HTTPS hostname for the web Worker before passkey enrollment

The checked-in Wrangler files contain a `staging` environment for the maintainers' installation. Treat it as a template: replace all Worker, D1, R2, Queue, Workflow, hostname, and account-specific values before deploying a separate installation.

## 1. Install and provision resources

```bash
bun install --frozen-lockfile

bunx wrangler d1 create gongyu
bunx wrangler r2 bucket create gongyu-uploads
bunx wrangler queues create gongyu-jobs
bunx wrangler queues create gongyu-jobs-dlq
```

Update both `apps/web/wrangler.jsonc` and `apps/jobs/wrangler.jsonc` so they reference the same D1 database and R2 bucket. Configure the Queue producer, consumer, and dead-letter queue in the jobs Worker.

Use unique names for:

- the web and jobs Workers;
- the data Workflow;
- D1 and R2 resources;
- the main queue and dead-letter queue.

The web Worker's Workflow bindings must use the deployed jobs Worker as `script_name`.

## 2. Configure the hostname

Set these web Worker variables for the deployment environment:

| Variable | Value |
| --- | --- |
| `APP_ENV` | An environment label such as `production` |
| `RP_ID` | The exact hostname, without scheme or port |
| `RP_ORIGIN` | The exact HTTPS origin, without a trailing slash |

Set the same `RP_ID` on the jobs Worker. Configure the web Worker's custom domain or `workers.dev` hostname to match.

Passkeys are bound to `RP_ID`. Changing it later requires passkey recovery or re-enrollment, so choose the final hostname first.

## 3. Configure secrets

Generate a 32-byte AES-GCM keyring and a bootstrap token locally:

```bash
bun -e 'const key=crypto.getRandomValues(new Uint8Array(32)); console.log(JSON.stringify({currentVersion:1,keys:{"1":Buffer.from(key).toString("base64")}}))'
bun -e 'console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"))'
```

Store the first output as `ENCRYPTION_KEYS` on **both** Workers and the second as `SETUP_TOKEN` on the web Worker. Wrangler prompts for each value without placing it in the command line:

```bash
bunx wrangler secret put ENCRYPTION_KEYS --env staging --config apps/jobs/wrangler.jsonc
bunx wrangler secret put ENCRYPTION_KEYS --env staging --config apps/web/wrangler.jsonc
bunx wrangler secret put SETUP_TOKEN --env staging --config apps/web/wrangler.jsonc
```

Replace `staging` with your configured environment. Keep the keyring outside the repository and back it up securely. Losing it makes encrypted social credentials and restored settings unreadable.

## 4. Validate and deploy

Validate, apply D1 migrations, and deploy:

```bash
bun run check
bun run deploy:staging
```

The root deployment script applies staging D1 migrations first, deploys the jobs Worker, then builds and deploys the web Worker.

For the checked-in production environment, run:

```bash
bun run deploy:production
```

This applies production D1 migrations first, deploys the jobs Worker, then builds and deploys the web Worker. For another environment, add equivalent environment bindings and migration-first scripts.

## 5. Enroll the administrator

Visit `https://your-host/setup`, enter `SETUP_TOKEN`, and register the administrator passkey. Setup closes after a passkey exists.

Use a passkey that is backed up or available on more than one trusted device. Recovery requires Cloudflare deployment access and rotating the bootstrap token.

Configure social providers and the public feed from **Admin → Settings**. Provider credentials are encrypted in D1 with `ENCRYPTION_KEYS`.

## Updating

```bash
git pull --ff-only
bun install --frozen-lockfile
bun run check
bun run deploy:staging
```

Never edit an applied migration. Add a new numbered SQL migration under `migrations/` and apply it before code that depends on it.

## Operations

Health check:

```text
https://your-host/health
```

Tail each Worker independently:

```bash
bunx wrangler tail --env staging --config apps/web/wrangler.jsonc
bunx wrangler tail --env staging --config apps/jobs/wrangler.jsonc
```

The jobs Worker consumes queue messages, runs Workflow classes, dispatches the D1 outbox every minute, and cleans expired sessions, jobs, audit events, and generated artifacts. Inspect Cloudflare Queues for dead-letter messages when background work repeatedly fails.

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

<p align="center">
  <img src="apps/web/public/images/logo.png" alt="Gongyu" width="120" height="120">
</p>

# Gongyu

Gongyu is a single-tenant bookmark manager inspired by [Shaarli](https://github.com/shaarli/Shaarli). It runs on Cloudflare Workers with a server-rendered React Router application and an Effect-based TypeScript backend.

## Features

- Bookmark creation, editing, deletion, search, and public detail pages
- Passkey-only administrator authentication
- Metadata extraction and private R2-backed thumbnails
- Bookmarklet, Atom feed, and Shaarli-compatible redirects
- HTML, JSON, and Shaarli data portability
- Full backups and restore workflows
- Optional Twitter, Mastodon, and Bluesky delivery
- Queue-backed background work with retries and job visibility

## Architecture

```text
Browser
  |
  v
Web Worker (React Router SSR)
  |-- D1: bookmarks, search, sessions, settings, job state
  |-- R2: thumbnails, import sources, exports, backups
  `-- Workflows: imports, exports, backups, restores
          |
          v
Jobs Worker
  |-- Queues: metadata, thumbnails, social delivery
  `-- Cron: outbox dispatch and cleanup
```

The repository is a Bun workspace:

- `apps/web` — React 19, React Router 8 SSR, and the HTTP Worker
- `apps/jobs` — queue, scheduled, and Workflow handlers
- `packages/domain` — Effect Schema domain models and contracts
- `packages/data` — D1 repositories and persistence adapters
- `packages/auth` — passkey and session services
- `packages/integrations` — R2, metadata, encryption, Shaarli, and social adapters
- `packages/ui` — shared UI compositions
- `migrations` — ordered Wrangler D1 migrations

Effect services keep business logic independent from React Router and Cloudflare bindings. Runtime-specific code stays at Worker and route boundaries.

## Requirements

- [Bun](https://bun.sh/) 1.3.9
- A modern browser with WebAuthn support
- A Cloudflare account for remote deployment

## Local development

```bash
bun install
bunx wrangler d1 migrations apply DB --local --config apps/web/wrangler.jsonc
bun run dev
```

Open <http://localhost:5173/setup> and use the local bootstrap token configured in `apps/web/wrangler.jsonc`.

Wrangler stores local D1 and R2 state under `.wrangler/`. The development configuration uses local bindings; it does not access the checked-in staging resources.

## Validation

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
bun run check
bun run --cwd apps/web test:e2e
```

Use `bun run test:unit` for fast runtime-neutral tests, `bun run test:workerd` for binding-dependent tests, and `bun run test:watch` while iterating. `bun run test` runs both projects.

`bun run check` typechecks both Workers, builds the web application, and performs Wrangler dry-run deployments.

## Deployment

Gongyu is deployed as two Cloudflare Workers backed by D1, R2, Queues, and Workflows. Apply D1 migrations before deploying either Worker.

See [docs/self-hosting.md](docs/self-hosting.md) for resource provisioning, secrets, deployment, and updates.

The repository's current remote environment is named `staging`:

```bash
bun run deploy:staging
```

This applies staging D1 migrations, deploys the jobs Worker, then builds and deploys the web Worker. Review the Wrangler resource names, IDs, hostnames, and secrets before using it for your own installation.

## Public routes

- `/` — public bookmark list
- `/search` — full-text search
- `/b/:shortUrl` — bookmark detail
- `/shaare/:hash` — permanent Shaarli redirect
- `/feed` — Atom feed
- `/bookmarklet` — quick-add bookmarklet
- `/health` — runtime and D1 health

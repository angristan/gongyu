# Cloudflare Rewrite Plan

## Status

> Historical implementation plan. The rewrite and production cutover are complete. The implementation uses Mantine 9 instead of the originally proposed Cloudflare Kumo components; current operational guidance lives in [`README.md`](../README.md) and [`docs/self-hosting.md`](self-hosting.md).

This document records the agreed direction for the full rewrite of Gongyu.

- Deployment model: single-tenant personal application
- Compatibility target: preserve existing features, data, and public URLs
- Runtime: Cloudflare Workers Paid
- Rendering: server-side rendering for public and authenticated routes
- UI: a compact design built with Mantine 9 and Tailwind CSS 4
- Application architecture: Effect v4
- Delivery: replace the legacy implementation through the Cloudflare rewrite pull request
- Production rollout: pending an explicitly authorized cutover

## Goals

1. Replace Laravel, Inertia, PHP, PostgreSQL, and the container deployment with a TypeScript application built for Cloudflare Workers.
2. Preserve bookmark data and stable public contracts:
   - `/`
   - `/search`
   - `/b/{shortUrl}`
   - `/shaare/{hash}` with permanent redirects
   - `/feed`
   - `/bookmarklet`
3. Preserve admin CRUD, search, dashboard, imports, exports, metadata fetching, thumbnails, social sharing, and destructive operations.
4. Replace password authentication with passkeys.
5. Redesign the interface without coupling domain behavior to React or Cloudflare bindings.
6. Make asynchronous work reliable, idempotent, observable, and recoverable.
7. Keep the application inexpensive and operable by one person.

## Non-goals

- Multi-tenancy, teams, roles, or per-bookmark ownership
- Private bookmarks, folders, or tags unless planned separately
- Exact visual compatibility with the current cozy theme
- Browser Rendering as the default metadata extractor
- A zero-downtime production cutover in the first implementation milestone
- Using every Cloudflare product when a simpler platform primitive is sufficient

## Current production baseline

The live Kubernetes deployment currently uses PostgreSQL and contains:

| Data | Current value |
| --- | ---: |
| Database size | 50 MB |
| Bookmarks | 6,264 |
| Users | 1 |
| Settings | 8 |
| Bookmarks with Shaarli hashes | 6,061 |
| Bookmarks with remote thumbnails | 46 |

The bookmark table itself is approximately 10 MB. This is comfortably within D1's current paid-plan limits.

Migration-sensitive behavior:

- `short_url`, `shaarli_short_url`, timestamps, descriptions, URLs, and thumbnail source URLs must be preserved exactly.
- URL deduplication remains exact string equality.
- Existing social credentials are encrypted with Laravel's `APP_KEY` and require a dedicated migration path.
- Existing password hashes will not be migrated; the administrator will enroll passkeys.
- PostgreSQL search stemming and D1 FTS5 tokenization will not produce identical ranking. The rewrite needs reasonable title, description, and URL search behavior, not identical result ordering.

## Target architecture

```text
Browser
   |
   v
Web Worker
React Router v8 + SSR + Kumo + static assets
   |
   +--------------------+---------------------+
   |                    |                     |
   v                    v                     v
D1                     R2                  Queue
bookmarks              thumbnails          metadata jobs
FTS5                    import files        social jobs
passkeys                exports/backups          |
sessions                                         v
settings                                    Jobs Worker
outbox/import state                       Effect runtime
                                                |
                                                v
                                           Workflows
                                      durable imports/exports
```

### Cloudflare products

| Product | Responsibility |
| --- | --- |
| Workers | React Router SSR, HTTP actions/loaders, Atom feed, Workflow triggers, queue consumers, scheduled dispatch |
| Workers Static Assets | Hashed browser assets, fonts, icons, and images |
| D1 | Canonical relational data, FTS5, passkeys, sessions, settings, job and import state |
| R2 | Mirrored thumbnails, private import sources, generated exports, and manual application backups |
| Queues | Metadata enrichment and social delivery |
| Workflows | Every import, export, backup, and restore operation |
| Workers Logs and Traces | Structured operational telemetry and Effect span export |
| Browser Rendering | Manual metadata retry for JavaScript-rendered pages only |

KV and Durable Objects are deliberately excluded from the initial design. Application-level CDN or Worker response caching is also deferred until after parity; public reads use D1 read replicas instead.

## Repository structure

Use a Bun workspace and keep runtime-specific code at the edges.

```text
apps/
  web/                 React Router SSR Worker
  jobs/                queue, scheduled, and Workflow Worker
packages/
  domain/              models, schemas, errors, and business operations
  data/                repositories, native D1 adapter, FTS5, and migrations
  integrations/        metadata, R2, Shaarli, and social providers
  auth/                WebAuthn and session services
  ui/                  shared Kumo compositions and application layouts
migrations/            ordered Wrangler D1 SQL migrations
tests/
  contracts/           Laravel compatibility fixtures and assertions
  migration/           production-shaped migration tests
```

The exact structure may be simplified during the runtime spike, but domain packages must not import React Router, Wrangler, or concrete Cloudflare bindings.

## Server-side rendering

React Router v8 runs as a full-stack framework through the Cloudflare Vite plugin.

- SSR is enabled for public and authenticated routes.
- Loaders read data and actions perform mutations; both remain thin transport boundaries.
- Public pages return complete indexable HTML, including bookmark content and metadata.
- `/b/{shortUrl}` uses its Gongyu URL for both canonical and `og:url`. It emits OpenGraph and Twitter Card metadata from the stored bookmark, uses the safe mirrored R2 thumbnail when available, and omits image metadata otherwise.
- Admin pages render the authenticated shell and initial data on the server.
- Authenticated responses use `Cache-Control: private, no-store`.
- The initial release does not use Cloudflare Cache API, CDN page caching, or KV-backed invalidation. Add public response caching only as a later measured optimization.
- Search results are server rendered and remain navigable without client-side JavaScript.
- Browser navigation progressively enhances forms and pagination.
- Components must not read `window`, `document`, storage, or media queries during server render.
- Theme selection is stored in a cookie and applied to the server document to avoid hydration mismatch and color-mode flashes.
- SSR and hydration failures are covered by automated tests.

## UI system: Cloudflare Kumo

Use `@cloudflare/kumo` as the component system, with React 19, Tailwind CSS v4, and Phosphor icons.

Implementation rules:

- Prefer granular Kumo component imports for tree-shaking.
- Import Kumo's Tailwind styles before Tailwind and include Kumo's distribution with `@source`.
- Configure Kumo's `LinkProvider` to use React Router navigation.
- Prefer styled Kumo components; use Kumo/Base UI primitives only when no suitable component exists.
- Use semantic Kumo tokens such as `bg-kumo-base`, `text-kumo-default`, and `border-kumo-line`.
- Do not use raw Tailwind colors or `dark:` variants; Kumo tokens own color-mode behavior.
- Compose classes through Kumo's `cn()` utility.
- Keep light and dark modes, keyboard navigation, focus management, reduced motion, and responsive layouts first-class.
- Use Kumo's CLI/component registry to verify component APIs before implementation.

Suggested Kumo mapping:

| Area | Kumo building blocks |
| --- | --- |
| Public bookmark list | Input, LayerCard, Badge, Pagination, Empty, Link |
| Admin shell | Sidebar, Breadcrumbs, Surface, Tabs |
| Bookmark management | Table, Toolbar, Dialog, Field, Input, Toast |
| Settings and secrets | Tabs, Field, SensitiveInput, Banner |
| Imports and jobs | LayerCard, Progress/Meter, Badge, Toast |
| Dashboard | Grid, LayerCard, Chart, Table |

The redesign should establish information architecture and reusable page compositions before route implementation. Visual snapshot review is required for desktop and mobile breakpoints.

## Effect architecture

Use `effect@beta` and keep all `@effect/*` packages version-aligned. Expected packages include `@effect/vitest`; add other Effect packages only when required by the runtime. Do not add `@effect/sql-d1` initially because its adapter does not preserve the native D1 capabilities required by this application.

### Runtime boundaries

Build one long-lived `ManagedRuntime` per Worker isolate for static services only. Never capture request state, `env`, authentication, or a D1 Session in that global runtime.

For the web Worker, `fetch` creates the request-scoped context, including bindings, request ID, authentication, and D1 Session, then exposes a scoped Effect runner through React Router's load context. Loaders and actions decode transport input, run named Effect operations through that runner, and map typed failures to responses. The outer `fetch` handler owns only router dispatch and the final uncaught-failure fallback; it does not create a competing second application runtime.

Queue, scheduled, and Workflow handlers are separate runtime boundaries. Each creates its invocation-scoped context and runs one top-level Effect. Business code returns `Effect`; runtime execution stays in these transport adapters.

### Services and layers

Define focused services with `Context.Service` and provide implementations with named layers.

Expected services include:

- `D1Store`
- `BookmarkRepository`
- `SearchRepository`
- `SessionRepository`
- `PasskeyRepository`
- `SettingsRepository`
- `OutboxRepository`
- `ObjectStorage`
- `MetadataClient`
- `ShaarliClient`
- `TwitterClient`
- `MastodonClient`
- `BlueskyClient`
- `QueuePublisher`
- `Encryption`

Rules:

- Use `Effect.fn` for reusable business operations.
- Use `Effect.gen` for readable orchestration inside those operations.
- Compose subsystem layers locally and provide the final layer at the Worker boundary.
- Do not call `Effect.provide` throughout business logic.
- Keep Cloudflare bindings in adapter layers, not domain services.
- Never use `any`, unsafe assertions, or unvalidated boundary values.

### Schemas and errors

Use Effect Schema for all external and persisted contracts:

- form data and query parameters
- D1 rows
- queue messages
- Workflow payloads and state references
- R2 object metadata
- Shaarli and social provider responses
- environment variables and Worker bindings
- import and export formats

Use named `Schema.Class` models and branded identifiers for stable IDs. Define expected failures with `Schema.TaggedErrorClass`, including validation, not-found, conflict, authentication, storage, provider, import, and delivery errors.

Transport boundaries map typed failures deliberately:

- validation -> `400` or field errors
- authentication -> `401`
- authorization/CSRF -> `403`
- missing bookmark -> `404`
- duplicate URL -> `409`
- provider or infrastructure outage -> `502`/`503`
- defects -> redacted `500` plus an error identifier

### D1 access

Use one application-owned `D1Store` Effect service backed directly by `D1Database` or `D1DatabaseSession`. This is the sole persistence adapter; repositories depend on it, while business logic never imports Cloudflare bindings.

The adapter must:

- expose prepared query, first-row, mutation, atomic batch, and Session operations;
- wrap native promise failures in typed operational errors;
- decode every returned row with Effect Schema rather than trusting generic row types;
- preserve safe `D1Result.meta` fields for rows read and written, duration, total attempts, serving region, and primary/replica status;
- add named spans around database operations without recording sensitive bind values;
- create exactly one D1 Session per request or job and share it through the invocation-scoped Effect context;
- use `first-unconstrained` Sessions for anonymous public reads so D1 read replicas can serve them;
- use `first-primary` Sessions for every authenticated request, mutation, Queue job, scheduled task, and Workflow step;
- keep all queries within one invocation sequentially consistent, without transporting D1 bookmarks across browser requests initially.

D1 read replication is enabled from the start. D1 `batch()` is an atomic group of preconstructed statements, not an interactive transaction. Repository methods name atomic behavior explicitly and test rollback when any statement fails. Existing and new bookmarks use numeric IDs; atomic outbox statements reference the application-generated `short_url`, which is known before the bookmark insert. Never perform network calls inside an authoritative database batch.

Use Wrangler SQL migrations as the sole schema-migration authority and deployment source of truth. Keep FTS5 virtual tables and triggers in hand-written migrations. Do not maintain parallel `@effect/sql-d1` and native query paths; the second abstraction adds complexity while still omitting required D1 capabilities.

### HTTP integrations and retries

Use Effect's HTTP abstractions when compatible with Workers; otherwise keep raw `fetch` inside a typed adapter service.

Every integration must:

1. construct and authenticate the request;
2. connect Effect cancellation to `AbortSignal`;
3. classify status before decoding;
4. decode unknown responses with Schema;
5. redact credentials and sensitive payloads;
6. return typed provider errors.

Retry ownership is singular at each boundary: a small bounded Effect retry may run inside one HTTP or storage attempt, Queue redelivery owns background-job retries, and Workflow owns step retries. Caps apply to the combined operation so nested layers cannot multiply attempts. Retry only proven idempotent work. Ambiguous social writes follow provider-specific rules rather than a generic retry.

### Observability

- Name business operations with `Effect.fn` so they appear in traces.
- Attach stable bookmark, job, import, request, and provider identifiers to spans.
- Use structured Effect logs; never log passkey material, tokens, imported content, or credential-bearing URLs.
- Track request duration, D1 rows read and written, query duration, total attempts, serving region, primary/replica status, queue age, retries, DLQ count, import progress, and provider outcomes.
- Bridge named Effect spans into Workers-native traces and structured logs at the infrastructure boundary with conservative sampling; do not add an external telemetry provider initially.

## Data model

The initial D1 schema should include:

- `bookmarks`
- `bookmarks_fts` with synchronization triggers
- `passkeys`
- `sessions`
- `settings`
- `outbox`
- `jobs`
- `social_deliveries`
- `import_runs`
- `backup_runs`

There is no administrator profile table: the application has one passkey identity and stores no administrator name or email. Wrangler's own migration table is the only schema-migration ledger.

Bookmark IDs remain numeric. Migration preserves every existing ID exactly, and new bookmarks continue with numeric IDs. `short_url` remains unique and is the stable reference used by outbox records created in the same D1 batch. Preserve both the original `thumbnail_url` source and a separate optional R2 mirror key; the UI never renders the remote source directly.

Outbox and job rows include explicit state, an atomic claim token, lease expiry, attempt count, and deterministic payload version. A scheduled sweeper reclaims expired leases. Each `social_deliveries` row stores a deterministic delivery ID, provider, state, formatting version, immutable payload snapshot, attempt counters, provider result identifier, and last error classification. Credentials are never copied into job payloads.

Social credentials remain encrypted in D1 with AES-GCM. Worker secrets hold a versioned current-and-previous keyring; rotation re-encrypts stored values before retiring the old key. The authenticated settings page preserves current behavior by returning decrypted values into sensitive inputs, so responses remain `private, no-store` and values are never logged.

## Passkey authentication

Use WebAuthn through SimpleWebAuthn, wrapped behind Effect services.

- The initial version supports exactly one administrator passkey.
- `/setup` is available only while no passkey exists and requires a deployment bootstrap token.
- Registering the passkey completes setup immediately and disables `/setup`.
- Authentication uses a discoverable credential and requires user verification.
- The passkey public key, counter, transports, backup state, and last-use timestamp are stored in D1. WebAuthn uses a stable random user handle and fixed `admin` name/display name without creating profile data.
- Session tokens are random, stored hashed in D1, rotated after authentication, and sent in secure `HttpOnly`, `SameSite=Lax`, `__Host-` cookies. Sessions have a 30-day absolute lifetime and expire after 7 idle days.
- Authentication challenges are short-lived, one-time, and bound to the exact environment hostname as origin and RP ID. Production and staging use separate passkeys.
- Mutation actions enforce origin checks and CSRF protection.
- There is no multi-passkey management UI initially. An authenticated administrator may replace the current passkey in one operation.
- Lost-passkey recovery is an explicit operator procedure requiring Cloudflare deployment access: invalidate all sessions, remove the existing credential, rotate the bootstrap token, and register one replacement through `/setup`. The recovery operation requires confirmation and emits an audit log.
- A restored passkey is accepted only when the backup and destination use the same RP ID; otherwise the destination keeps its passkey or runs setup.
- No application-specific endpoint rate limits are added initially. Request size, timeout, and Workflow limits remain explicit.

## Background processing

### Metadata preview and thumbnails

The admin create form and bookmarklet preserve the pre-submit metadata flow:

1. after the user enters a valid HTTPS URL, the browser calls an authenticated metadata-preview action;
2. the action performs one bounded HTML fetch and returns candidate title and description without persisting them;
3. the create form fills only empty title or description fields and never overwrites user edits;
4. the edit form shows refreshed candidates and lets the user choose which fields to apply;
5. the pre-save preview is text-only; OpenGraph images are fetched and shown only after saving and safe R2 mirroring;
6. metadata failure never prevents manual bookmark creation.

Metadata fetching accepts any HTTPS hostname, including addresses that are not preclassified as public. It rejects embedded URL credentials, sends no application cookies or authorization headers, and stops if any redirect leaves HTTPS. Every attempt limits redirect count, connection and wall time, response and decompressed bytes, and accepted content types.

On submission, the final user-edited title and description are authoritative. Bookmark creation atomically writes the bookmark, metadata outbox item, and requested social-delivery intents. The outbox dispatcher uses an atomic D1 claim with a lease timeout; a scheduled sweep retries unclaimed work and reclaims expired leases.

The jobs Worker:

1. claims each deterministic job ID before processing and skips completed jobs;
2. fetches bounded HTML under the HTTPS-only policy;
3. extracts title, description, and OpenGraph image with `HTMLRewriter`;
4. resolves relative image URLs, validates image type and size, stores the exact source URL, and mirrors valid images to private R2;
5. never overwrites the submitted bookmark title or description during background enrichment;
6. records a typed terminal or retryable outcome and releases or expires its lease correctly.

The public UI displays only mirrored R2 thumbnails served through a same-origin Worker route. Existing remote thumbnail source URLs are preserved and queued for mirroring during migration; a bookmark shows no image until its mirror succeeds. A manual **Retry with browser** action may invoke Browser Rendering when normal extraction finds no useful metadata. It uses the same HTTPS, redirect, time, byte, and content limits and is never an automatic fallback.

Deleting a bookmark first marks it pending deletion in D1, immediately deletes its R2 thumbnail if present, and then finalizes the D1 deletion. Failed cross-store cleanup is retried from the pending state.

### Social delivery and provider previews

Show the `share_social` control only when at least one provider is fully configured, and preserve the current default of enabled. Twitter requires all four existing credential values, Mastodon requires instance plus access token, and Bluesky requires handle plus app password. A checked submission creates one delivery intent for each configured provider; an unchecked submission creates none.

Delivery intents begin in `waiting_metadata`. A terminal metadata outcome, successful or not, makes them ready, so failed extraction cannot block sharing forever. At that transition, persist an immutable payload snapshot from the submitted URL, title, description, and optional validated R2 thumbnail. Later bookmark edits do not change an in-flight or retried post.

Provider formatting preserves current behavior. Application-generated posts link to the original bookmark URL; Gongyu's own OpenGraph metadata supports crawlers and users who manually share `/b/{shortUrl}`.

- Twitter: title plus original URL, truncated to 280 characters using Twitter's 23-character URL accounting. Twitter generates its own link card. After an ambiguous response or timeout, do not retry automatically; move the delivery to `needs_review` for an explicit manual decision because Twitter cannot guarantee duplicate prevention.
- Mastodon: title plus original URL, truncated to 500 characters. Send a deterministic `Idempotency-Key` so safe Queue redelivery does not create another status.
- Bluesky: title plus original URL, truncated to 300 characters, with a byte-correct link facet and explicit external embed containing URL, title, description, and the mirrored thumbnail blob when available. Use a deterministic record key for idempotent creation.

Each provider receives a separate deterministic delivery ID and versioned Queue message. Consumers atomically claim a D1 lease before calling a provider. Queue redelivery owns retries, while one bounded Effect attempt handles only local transient transport behavior. Provider success and failure do not roll back bookmark creation or other providers.

The admin job UI shows `waiting_metadata`, `queued`, `delivered`, `retrying`, `needs_review`, and `failed`. It permits explicit retry of failed immutable deliveries and an informed manual action for ambiguous Twitter deliveries. Provider adapters read encrypted credentials only at delivery time. Missing or invalid credentials produce a visible typed failure without exposing secrets.

### Imports and exports

Every import and export runs through a Workflow, including tiny files. The authenticated UI starts the Workflow, shows progress, and presents the result or download when complete.

- Upload import files directly or by streaming into private R2, and put only the R2 key plus compact versioned state in the Workflow payload.
- Use a deterministic Workflow ID. Each bounded import chunk atomically commits valid rows and its resume checkpoint in one D1 batch.
- Import valid rows, skip exact-URL duplicates, collect per-row errors, and support resume after failure.
- Preserve current Gongyu JSON v1.0 and all current Shaarli inputs, including API, datastore, Netscape HTML, `SHORTURL`, and `SHAARLI_SHORTURL` behavior.
- Preserve numeric bookmark IDs when present and valid, stable URL identifiers, and exact timestamp instants.
- Delete the private import source immediately after terminal Workflow completion.
- Generate every export into private R2. Preserve current Gongyu JSON v1.0 fields and Shaarli-compatible Netscape custom attributes.
- Serve generated exports through authenticated short-lived downloads and delete them after 24 hours.

### Manual backups and restore

Portable bookmark exports and full disaster backups are separate artifacts. A full backup is started only from the authenticated admin UI; there is no schedule or operator CLI trigger.

Before a full backup, put the single-user application into a brief read-only mode. Export canonical bookmarks, settings ciphertext, the passkey record, stable configuration, encryption-key versions, and a manifest to versioned data in private R2. Exclude sessions, outbox rows, transient jobs, import runs, backup-run rows, and delivery history. Do not add whole-file encryption: private R2 access plus field-level encryption for social credentials is the chosen protection. Delete the backup after 24 hours.

Restore also runs as a Workflow and offers two modes:

- **Replacement:** require a typed confirmation phrase, enter read-only mode, validate the manifest, replace canonical state, and rebuild FTS5. Do not create an automatic pre-restore backup. Restore the passkey only when source and destination RP IDs match; otherwise keep the destination credential or require setup.
- **Merge:** import bookmarks with exact-URL duplicates skipped and reported, overwrite current settings with backup settings, and keep the current passkey.

Restoring settings requires the source encryption key version to be available temporarily in the destination keyring. Decrypt restored values and immediately re-encrypt them with the destination's current key; fail the settings portion without changing existing values if the source key is unavailable.

D1 data and Workflow checkpoints commit atomically per chunk. Restore reports row counts, collisions, checksums, and FTS rebuild status before leaving read-only mode.

## Compatibility matrix

Only public URLs and `/bookmarklet` are stable route contracts; authenticated `/admin/*` paths and methods may change with the redesign. The rewrite is not complete until these behaviors pass contract tests:

| Capability | Required behavior |
| --- | --- |
| Public list | Newest-first pagination and SSR; both `/` and `/search` accept `q`, and existing `/?q=` links remain valid |
| Search | Reasonable case-insensitive title, description, and URL results through D1 FTS5; identical PostgreSQL ranking is not required |
| Bookmark page | Existing `/b/{shortUrl}` URLs resolve |
| Shaarli links | Existing `/shaare/{hash}` URLs return permanent redirects |
| Feed | Valid Atom at `/feed`; item count defaults to 50 and is administrator-configurable with no application-level maximum |
| Bookmarklet | Preserve `url`, `title`, selected-text `description`, `source`, duplicate handling, passkey-login return to the original popup URL, and automatic close after save |
| CRUD | URL maximum 2,048, title maximum 500, exact-string duplicate detection, stable `short_url` on edit, and destructive confirmation |
| Metadata preview | Authenticated title/description candidates before save; create fills empty fields, edit chooses fields, and failure is non-blocking |
| Thumbnails | Preserve remote source URLs, display only safe R2 mirrors, and show no image while mirroring is unavailable |
| Public link preview | Bookmark detail uses its Gongyu URL for canonical/OpenGraph/Twitter Card metadata with an optional R2 image |
| Import | Workflow-based current Gongyu JSON v1.0, Shaarli API/datastore, and Netscape HTML compatibility with resumable partial success |
| Export | Workflow-based current Gongyu JSON v1.0 and Netscape custom attributes, downloadable for 24 hours |
| Backup/restore | Manual full backup, 24-hour retention, replacement and merge modes, typed replacement confirmation |
| Social | Current provider configuration rules and formatting, provider-specific idempotency, Twitter manual review after ambiguous delivery, and isolated failures |
| Settings | Preserve all eight social settings and return decrypted values to the authenticated no-store form as the current app does |
| Dashboard | Equivalent counts, trends, and recent bookmarks |

## Migration strategy

Production cutover is deferred, but migration tooling is part of the rewrite.

1. Export PostgreSQL into a versioned normalized format without exposing secrets.
2. Export all eight social settings inside the old Laravel environment, decrypt the currently encrypted values using `APP_KEY`, immediately encrypt every migrated value for the Worker keyring, and remove plaintext migration artifacts.
3. Preserve every bookmark's numeric ID, `short_url`, `shaarli_short_url`, URL, title, description, and remote thumbnail source exactly.
4. Preserve each timestamp's exact instant and available precision, store it normalized to UTC, and reproduce an equivalent value in compatible exports.
5. Do not migrate the administrator name, email, or password.
6. Import base bookmarks in bounded chunks, rebuild FTS5, and enqueue the 46 existing remote thumbnails for safe R2 mirroring.
7. Validate row counts, exact unique fields, aggregate checksums, reasonable representative searches, compatible exports, valid feed output, and all legacy redirects.
8. Enroll a separate single passkey for the destination environment.
9. Repeat the complete process against a disposable remote D1 database before production cutover.

D1 native export cannot export databases containing FTS5 virtual tables. Full backups therefore use the application format and rebuild FTS indexes during restore. D1 Time Travel remains an additional recovery mechanism, not the only backup.

## Testing strategy

- `@effect/vitest` for Effect operations, errors, retries, schemas, and layers
- `@cloudflare/vitest-pool-workers` or the current Cloudflare Workers test integration for D1, R2, Queue, and runtime behavior
- React Testing Library for Kumo compositions and hydration behavior
- Playwright for browser journeys, responsive UI, accessibility, bookmarklet behavior, and virtual WebAuthn authenticators
- Property tests for import parsers, URL normalization, short URL generation, and schema round-trips
- Contract fixtures derived from the existing PHPUnit suite
- Route and format fixtures for public URLs, bookmarklet return/close behavior, Gongyu JSON v1.0, Shaarli/Netscape custom fields, and valid configurable Atom output
- Social contract tests for configured-provider rules, opt-in behavior, character and byte truncation, Mastodon idempotency, Bluesky deterministic records, Twitter ambiguity, metadata fallback, and duplicate Queue delivery
- Worker integration tests for atomic outbox claims, lease expiry, Workflow chunk checkpoints, read-replica versus primary routing, and pending R2 deletion recovery
- Backup tests for read-only snapshots, 24-hour expiry, replacement, merge collisions, settings overwrite, RP-ID passkey rules, and FTS rebuild
- Migration tests against a production-shaped anonymized export, including exact numeric IDs, timestamps, stable identifiers, settings, and thumbnail-source preservation

Use `it.effect` and shared test layers instead of calling `Effect.runPromise` inside ordinary tests. Test layers provide deterministic repositories, clocks, HTTP clients, queues, and encryption.

Minimum CI gates:

```text
format -> lint -> typecheck -> unit/effect tests -> worker integration tests
       -> React tests -> Playwright parity tests -> SSR build -> Wrangler dry run
```

## Deployment and operations

- Pin Wrangler, Effect, Kumo, React Router, and Cloudflare types in the lockfile.
- Maintain completely separate staging and production D1 databases, R2 buckets, Queues, Workflows, secrets, Worker names, exact-host RP IDs, and passkeys.
- Never bind pull-request previews to production state.
- Apply Wrangler D1 migrations before deploying code that requires them, using expand/backfill/contract changes. Do not maintain a second application migration ledger.
- Version every Queue and Workflow payload. Deploy backward-compatible consumers before producers and keep consumers able to read old in-flight versions until drained.
- Worker rollback does not roll back schema or data.
- Configure one retry owner per boundary, CPU limits, Queue retry caps, Workflow retention, log sampling, DLQs, and atomic job-lease expiry explicitly.
- Rotate credential-encryption keys through a current-and-previous keyring and complete re-encryption before retiring an old key.
- Delete import sources immediately at terminal completion, expire exports and manual backups after 24 hours, and recover pending immediate R2 deletions.
- Do not enable application-level response caching or endpoint-specific rate limits initially.
- Use Workers Builds or CI only after verifying the current project-pinned Wrangler schema and deployment behavior.
- Estimate current and worst-case cost before manually enabling Browser Rendering, increasing trace sampling, or adding fan-out.

The expected baseline is the Workers Paid minimum charge, with current personal usage remaining inside the included D1, R2, Queue, Workflow, and observability allowances. Pricing must be rechecked before production deployment.

## Delivery phases

### Phase 0: runtime spike (2-3 days)

- React Router SSR on Workers
- Kumo SSR, routing, theme cookie, and hydration
- shared Effect ManagedRuntime with request-scoped React Router runners and separate Queue/Workflow boundaries
- native `D1Store` Effect service with Schema-decoded queries and typed failures
- atomic D1 batch with a verified rollback failure case and outbox reference by `short_url`
- anonymous replica Sessions, authenticated primary Sessions, and metadata-enriched spans
- atomic job claims with lease expiry and recovery
- D1 FTS5 trigger and representative search
- exact-host SimpleWebAuthn registration and authentication
- R2 streaming upload plus versioned Workflow reference payload

**Exit:** every high-risk integration works in a deployed staging Worker.

### Phase 1: platform foundation (3-5 days)

- workspace structure and shared packages
- environment bindings and layer graph
- migrations and staging resources
- observability and CI
- Kumo application shell and design tokens

**Exit:** SSR shell deploys to staging with health checks, migrations, logs, and tests.

### Phase 2: authentication and core data (4-6 days)

- single-passkey setup, login, replacement, logout, sessions, and operator recovery
- bookmark CRUD and validation
- FTS5 search
- outbox and job state

**Exit:** authenticated CRUD and public reads work without integrations.

### Phase 3: public and admin redesign (7-10 days)

- public list, search, bookmark detail, feed, and legacy redirects
- admin list, forms, dashboard, settings, and bookmarklet
- responsive and accessible Kumo design
- SSR and progressive enhancement across all routes

**Exit:** all primary user journeys pass browser and contract tests.

### Phase 4: integrations and background work (5-7 days)

- text-only pre-submit metadata candidates, field-selective edit refresh, and HTTPS-only fetching
- manual Browser Rendering retry, background enrichment, migrated thumbnail mirroring, and immediate R2 deletion recovery
- public OpenGraph and Twitter Card metadata using the Gongyu canonical URL
- exact Twitter, Mastodon, and Bluesky payload formatting and provider-specific duplicate protection
- metadata-gated immutable social deliveries, atomic leases, Twitter `needs_review`, DLQ, and job UI

**Exit:** preview fallbacks and provider payloads pass contract tests; integration failures are isolated, visible, and recoverable.

### Phase 5: import, export, and migration tooling (5-7 days)

- all current Gongyu and Shaarli import/export formats through Workflows
- atomic resumable import checkpoints, progress, R2 cleanup, and 24-hour export downloads
- manual read-only full backups and replacement/merge restore
- PostgreSQL-to-D1 migration rehearsal with exact IDs, timestamps, settings, and thumbnail sources

**Exit:** a production-shaped export migrates with verified parity, and backup replacement plus merge restore pass recovery tests.

### Phase 6: hardening and parity (5-7 days)

- security and accessibility review
- performance and D1 query-plan review
- failure injection for providers, queues, and Workflows
- final compatibility matrix and operational runbooks

**Exit:** no unresolved critical parity, security, migration, or recovery issues.

Estimated implementation time: 6-8 full-time weeks, excluding production cutover.

## Main risks

1. Effect v4 is beta; exact APIs must be verified against the installed version, and all installed `@effect/*` packages must remain version-aligned.
2. D1 exposes atomic batches rather than interactive transactions; the native adapter and job leases must preserve rollback, Session, claim, error, and result-metadata semantics.
3. SSR plus Kumo color mode can hydrate incorrectly unless the server and browser use the same cookie-derived mode.
4. D1 FTS5 differs from PostgreSQL stemming and ranking; broad reasonable-result acceptance may hide regressions without a representative corpus.
5. Queue delivery is at-least-once. Mastodon and Bluesky have explicit duplicate protection, but an ambiguous Twitter result still requires manual review.
6. Metadata fetching intentionally accepts any HTTPS host and has no endpoint rate limit. HTTPS-only redirects and strict resource bounds reduce but do not eliminate SSRF and resource-exhaustion risk.
7. Returning decrypted social credentials to the authenticated browser preserves current behavior but increases exposure compared with replace-only secret fields.
8. A configurable feed with no application maximum can exceed Worker response or CPU limits if misconfigured.
9. Simultaneous redesign and strict behavior parity increase review time.
10. D1 FTS5 complicates native export, and full backups have only private-R2 plus field-level encryption, so restore tests and access controls are critical.

## References

- [React Router on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
- [Cloudflare Kumo](https://github.com/cloudflare/kumo)
- [Kumo installation](https://kumo-ui.com/installation/)
- [D1 Workers binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 result metadata](https://developers.cloudflare.com/d1/worker-api/return-object/)
- [D1 read replication and Sessions](https://developers.cloudflare.com/d1/best-practices/read-replication/)
- [D1 SQL and FTS5](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
- [Effect](https://effect.website/docs/)

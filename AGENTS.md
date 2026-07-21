# Gongyu contributor guidance

## Stack

Gongyu is a Bun workspace targeting Cloudflare Workers.

- `apps/web`: React 19, React Router 8 SSR, Mantine, Tailwind CSS, and the Cloudflare Worker entrypoint
- `apps/jobs`: Reusable Queue, scheduled, and Cloudflare Workflow implementations
- `packages/*`: Effect-based domain, data, auth, integration, and UI modules
- Persistence: D1 with hand-written Wrangler migrations
- Object storage: private R2
- Tooling: TypeScript, Biome, Vitest with workerd, Playwright, Wrangler

Use Bun for dependency management and scripts. Do not add or change dependencies without approval.

## Architecture

- Keep Cloudflare bindings and React Router types at runtime boundaries.
- Keep route loaders/actions thin: decode transport input, authorize, call Effect operations, and map failures to responses.
- Put reusable business logic in `packages/*` or the appropriate app service, not in React components.
- Use Effect services for dependencies and typed errors for expected failures. Prefer `Effect.fn` for reusable operations and `Effect.gen` for orchestration.
- Validate external, persisted, queue, Workflow, and configuration values with Effect Schema.
- Never use `any`, unsafe casts, or unvalidated boundary data.
- Create request- or invocation-scoped D1 sessions and services at Worker boundaries. Do not capture request state or Worker `env` in global runtimes.
- Use repositories backed by `packages/data/src/d1-store.ts`; avoid ad hoc data access in UI code.
- Keep network calls outside authoritative D1 batches. Queue and Workflow work must be idempotent and safe to retry.

## React Router and SSR

- Route modules live in `apps/web/app/routes`; register routes in `apps/web/app/routes.ts`.
- Use React Router navigation, loaders, actions, forms, redirects, and response helpers.
- Public and authenticated pages are server rendered. Do not access browser globals during render.
- Preserve usable server-rendered HTML and no-JavaScript behavior except where browser APIs are inherently required, such as passkeys.
- Reuse components from `apps/web/app/components` and `packages/ui` before creating new ones.
- Preserve origin/CSRF checks and authenticated `private, no-store` responses for mutations and sensitive pages.

## Cloudflare resources

- `apps/web/wrangler.jsonc` is the sole Worker configuration and must define HTTP routes, D1, R2, Images, Queues, cron, and Workflows together.
- The Worker entrypoint owns HTTP, Queue, and scheduled handlers and exports Workflow implementations from `apps/jobs`.
- Never put secrets in Wrangler configuration or source code. Use Wrangler secrets for `ENCRYPTION_KEYS` and `SETUP_TOKEN`.
- Do not hand-edit `worker-configuration.d.ts`; regenerate binding types with the app's `typecheck` or `cf-typegen` script.
- Do not run remote migrations, deploy Workers, modify Cloudflare resources, or touch production data without explicit authorization.
- Apply D1 migrations before deploying code that depends on them.

## D1 migrations

- `migrations/` is the sole schema migration source of truth.
- Never rewrite, reorder, or delete an applied migration.
- Add a new sequentially numbered SQL migration for every schema change.
- Keep FTS tables, triggers, indexes, and rollback behavior explicit and test migration paths with workerd.

## Tests and checks

Every behavior change must have meaningful automated coverage. Run the smallest relevant test first, then the checks appropriate to the change.

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
bun run check
bun run --cwd apps/web test:e2e
```

- `bun run test` runs the web/workerd Vitest suite.
- `bun run check` typechecks both apps, builds the Worker, and performs a Wrangler deployment dry run.
- Run Playwright when changing routes, forms, authentication, SSR, hydration, or user journeys.
- Use `bun install --frozen-lockfile` when verifying the committed lockfile.

## Operational quality

- Preserve public route contracts, especially `/`, `/search`, `/b/:shortUrl`, `/shaare/:hash`, `/feed`, and `/bookmarklet`.
- Treat passkey material, setup tokens, encryption keys, provider credentials, imported data, and signed URLs as sensitive. Never log them.
- Add useful structured logs and stable identifiers at operational boundaries without recording sensitive payloads.
- Consider retries, duplicate delivery, dead-letter handling, partial D1/R2 failure, cleanup, and observability for background work.
- Keep changes focused, readable, and consistent with neighboring files. Update documentation when commands, bindings, or operational behavior change.

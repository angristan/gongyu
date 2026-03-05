<p align="center">
  <img src="static/logo.png" alt="Gongyu" width="120" height="120">
</p>

# Gongyu (Go Rewrite)

A full Go rewrite of Gongyu using:

- Go 1.26
- stdlib `net/http` router/middleware
- SQL (`database/sql`) with SQLite or PostgreSQL
- `templ` for server-side UI components
- `htmx` for progressive interactivity

## Features

- Public bookmarks index/search (`/`, `/search`)
- Single bookmark pages (`/b/{shortUrl}`)
- Legacy Shaarli redirects (`/shaare/{hash}`)
- Atom feed (`/feed`)
- Setup flow (`/setup`)
- Session auth (`/login`, `/logout`)
- Admin dashboard/bookmark CRUD/settings/import/export
- Metadata fetching + OG thumbnail extraction
- Social posting (Twitter, Mastodon, Bluesky)
- Shaarli imports (HTML/API/datastore) + Gongyu JSON restore

## Requirements

- Go 1.26+
- SQLite (default) or PostgreSQL

## Quick Start

```bash
go mod tidy

echo 'SESSION_SECRET=replace-me-with-a-long-random-string' > .env
echo 'SETTING_SECRET=replace-me-with-a-different-long-random-string' >> .env

# Optional overrides
# echo 'DATABASE_URL=sqlite://gongyu.db' >> .env
# echo 'APP_ADDR=:8080' >> .env
# echo 'APP_URL=http://localhost:8080' >> .env

set -a
source .env
set +a

go run ./cmd/server
```

Then open `http://localhost:8080`.

## Environment Variables

- `APP_ENV` (default: `development`)
- `APP_ADDR` (default: `:8080`)
- `APP_NAME` (default: `Gongyu`)
- `APP_URL` (default: `http://localhost:8080`)
- `DATABASE_URL` (default: `sqlite://gongyu.db`)
- `SESSION_SECRET` (required)
- `SETTING_SECRET` (required)
- `ALLOW_INSECURE_COOKIES` (default: `true`)
- `UMAMI_URL` (optional)
- `UMAMI_WEBSITE_ID` (optional)

## Database

Migrations run automatically at startup.

- SQLite: tables + FTS5 index + sync triggers
- PostgreSQL: tables + `search_vector` + trigger-based updates

## Development

```bash
# Regenerate templ components
$(go env GOPATH)/bin/templ generate ./internal/view

# Build
go build ./...

# Test
go test ./...
```

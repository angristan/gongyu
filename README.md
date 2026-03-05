<p align="center">
  <img src="static/images/logo.png" alt="Gongyu" width="120" height="120">
</p>

# Gongyu

A modern, self-hosted, single-tenant bookmark manager inspired by [Shaarli](https://github.com/shaarli/Shaarli). Built with Go, PostgreSQL, and htmx. Ships as a single binary with embedded templates and static assets.

## Features

- **Bookmark Management** - Save, organize, and search your bookmarks
- **Full-Text Search** - Fast search powered by PostgreSQL tsvector with GIN index
- **OpenGraph Thumbnails** - Automatically fetches og:image from bookmarked URLs for visual previews
- **Bookmarklet** - Quick-add bookmarks from any page with a browser bookmarklet
- **Shaarli Migration** - Three import methods: API, Database file, or HTML export
- **Export** - Download bookmarks as HTML (Netscape format) or JSON
- **Legacy URL Support** - 301 redirects from old Shaarli URLs (`/shaare/{hash}`)
- **Atom Feed** - Subscribe to your bookmarks at `/feed`
- **Social Sharing** - Optional auto-posting to Twitter, Mastodon, and Bluesky
- **Dashboard** - Stats and visualizations of your bookmark collection
- **Dark/Light Mode** - Automatic based on system preference

## Tech Stack

- **Backend**: Go 1.26+, [chi](https://github.com/go-chi/chi) router, [sqlc](https://sqlc.dev) for type-safe SQL
- **Frontend**: Server-rendered HTML (`html/template`), [htmx](https://htmx.org)
- **Database**: PostgreSQL with full-text search (tsvector + GIN index)
- **Migrations**: [goose](https://github.com/pressly/goose) (embedded, run automatically on startup)
- **Assets**: Embedded via `go:embed` — single binary, no external files needed

## Quick Start

Requires a running PostgreSQL instance.

```bash
go build -o gongyu ./cmd/gongyu
DATABASE_URL=postgres://localhost:5432/gongyu?sslmode=disable ./gongyu
```

Visit `http://localhost:8080/setup` to create your admin account.

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://localhost:5432/gongyu?sslmode=disable` | PostgreSQL connection string |
| `LISTEN_ADDR` | `:8080` | HTTP listen address |
| `BASE_URL` | `http://localhost:8080` | Public URL (for feeds, bookmarklet) |
| `APP_KEY` | (insecure default) | Secret key for encrypting settings (e.g. API tokens) |

## Docker

```bash
docker build -t gongyu .
docker run -p 8080:8080 \
  -e DATABASE_URL=postgres://user:pass@host:5432/gongyu \
  -e APP_KEY=your-random-secret-key \
  gongyu
```

## Development

```bash
# Start PostgreSQL (e.g. via Docker)
docker run -d --name gongyu-pg -e POSTGRES_DB=gongyu -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:17

# Run the app
go run ./cmd/gongyu

# Regenerate sqlc queries after editing queries/*.sql
sqlc generate
```

## Setup

1. Visit `/setup` to create your admin account (only available when no users exist)
2. Log in at `/login`
3. Configure your bookmarklet in the Dashboard
4. Optionally configure social media credentials in Settings

## Importing from Shaarli

Go to Settings > Import to migrate your bookmarks. Three methods are available:

### API Import (Recommended)
1. In Shaarli, go to Tools > Configure your Shaarli > REST API
2. Copy your API secret
3. Enter your Shaarli URL and API secret in Gongyu
4. Click Import

### Database Import
1. Locate `data/datastore.php` in your Shaarli installation
2. Upload the file in Gongyu

### HTML Import
1. In Shaarli, go to Tools > Export
2. Export as HTML (Netscape bookmark format)
3. Upload the HTML file in Gongyu

> **Note**: API and Database imports preserve legacy Shaarli URLs (`/shaare/{hash}`), enabling automatic redirects. HTML import does not preserve these URLs.

## Restoring from Backup

Go to Settings > Import > Restore from Backup to restore bookmarks from a Gongyu JSON export. This preserves all data including short URLs, Shaarli legacy URLs, and thumbnails.

## Exporting Bookmarks

Go to Settings > Export to download your bookmarks:
- **HTML**: Netscape bookmark format (compatible with browsers and Shaarli)
- **JSON**: Full data backup with all fields

## API / Feeds

- **Atom Feed**: `/feed` - All public bookmarks in Atom format
- **Single Bookmark**: `/b/{shortUrl}` - View a single bookmark
- **Legacy Shaarli**: `/shaare/{hash}` - Redirects to new URL

## License

MIT

# Gongyu

A modern, self-hosted bookmark manager inspired by [Shaarli](https://github.com/shaarli/Shaarli). Built with Laravel 12, React, Mantine UI, and Inertia.js.

## Features

- **Bookmark Management** - Save, organize, and search your bookmarks
- **Full-Text Search** - Fast search powered by SQLite FTS5 or PostgreSQL tsvector
- **Bookmarklet** - Quick-add bookmarks from any page with a browser bookmarklet
- **Shaarli Import** - Migrate from Shaarli with full history preservation (including original dates)
- **Legacy URL Support** - 301 redirects from old Shaarli URLs (`/shaare/{hash}`)
- **Atom Feed** - Subscribe to your bookmarks at `/feed`
- **Social Sharing** - Optional auto-posting to Twitter, Mastodon, and Bluesky
- **Dashboard** - Stats and visualizations of your bookmark collection
- **Dark Mode** - Automatic dark/light theme based on system preference

## Tech Stack

- **Backend**: Laravel 12, PHP 8.4+, [Laravel Actions](https://laravelactions.com/)
- **Frontend**: React 18, TypeScript, [Mantine 8](https://mantine.dev/), Inertia.js with SSR
- **Database**: SQLite or PostgreSQL (both fully supported)

## Requirements

- PHP 8.4+
- Node.js 20+
- Composer
- SQLite or PostgreSQL

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/gongyu.git
cd gongyu

# Install dependencies
composer install
npm install

# Configure environment
cp .env.example .env
php artisan key:generate

# Run migrations
php artisan migrate

# Build frontend assets
npm run build

# Start the server
php artisan serve
```

## Development

Run all services concurrently:

```bash
composer run dev
```

This starts:
- Laravel development server
- Queue worker
- Log viewer (Pail)
- Vite dev server with HMR

### Git Hooks

This project uses [Husky](https://typicode.github.io/husky/) for Git hooks. After running `npm install`, a pre-commit hook is automatically set up that runs `composer check`:

- **Pint** - PHP code style (Laravel preset)
- **PHPStan** - PHP static analysis
- **Biome** - TypeScript/React linting and formatting

To manually run checks:

```bash
# Check for issues
composer check

# Auto-fix formatting
composer lint
```

## Setup

1. Visit `/setup` to create your admin account (only available when no users exist)
2. Log in at `/login`
3. Configure your bookmarklet in Settings
4. Optionally configure social media credentials for auto-sharing

## Importing from Shaarli

1. In Shaarli, go to Tools > Export
2. Export as HTML (Netscape bookmark format)
3. In Gongyu, go to Dashboard > Import from Shaarli
4. Upload your HTML export file

All bookmarks will be imported with their original timestamps preserved. Legacy Shaarli URLs will automatically redirect to the new short URLs.

## Configuration

### Environment Variables

```env
# Database - choose SQLite or PostgreSQL
DB_CONNECTION=sqlite

# Or use PostgreSQL:
# DB_CONNECTION=pgsql
# DB_HOST=127.0.0.1
# DB_DATABASE=gongyu
# DB_USERNAME=gongyu
# DB_PASSWORD=secret

# App URL (required for bookmarklet)
APP_URL=http://localhost:8000
```

### Social Media (Optional)

Configure in Settings or via environment:

```env
# Twitter API v2
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_SECRET=

# Mastodon
MASTODON_INSTANCE=https://mastodon.social
MASTODON_ACCESS_TOKEN=

# Bluesky
BLUESKY_HANDLE=yourname.bsky.social
BLUESKY_APP_PASSWORD=
```

## Docker

Run with Docker (uses SQLite by default):

```bash
docker run -d \
  --name gongyu \
  -p 8080:80 \
  -v gongyu-data:/var/www/html/database \
  -v gongyu-storage:/var/www/html/storage \
  -e APP_KEY=base64:$(openssl rand -base64 32) \
  -e APP_URL=http://localhost:8080 \
  ghcr.io/your-username/gongyu:latest
```

Then run migrations:

```bash
docker exec gongyu php artisan migrate --force
```

### Docker with PostgreSQL

```bash
docker run -d \
  --name gongyu \
  -p 8080:80 \
  -v gongyu-storage:/var/www/html/storage \
  -e APP_KEY=base64:$(openssl rand -base64 32) \
  -e APP_URL=http://localhost:8080 \
  -e DB_CONNECTION=pgsql \
  -e DB_HOST=your-postgres-host \
  -e DB_DATABASE=gongyu \
  -e DB_USERNAME=gongyu \
  -e DB_PASSWORD=secret \
  ghcr.io/your-username/gongyu:latest
```

### Server-Side Rendering (SSR)

SSR is disabled by default. To enable it, run the SSR sidecar container alongside the main app:

```bash
# Run SSR container
docker run -d \
  --name gongyu-ssr \
  ghcr.io/your-username/gongyu:ssr

# Run app with SSR enabled
docker run -d \
  --name gongyu \
  -p 8080:80 \
  --link gongyu-ssr \
  -e INERTIA_SSR_ENABLED=true \
  -e INERTIA_SSR_URL=http://gongyu-ssr:13714 \
  -e APP_KEY=base64:$(openssl rand -base64 32) \
  -e APP_URL=http://localhost:8080 \
  ghcr.io/your-username/gongyu:latest
```

Or with Docker Compose:

```yaml
services:
  app:
    image: ghcr.io/your-username/gongyu:latest
    ports:
      - "8080:80"
    environment:
      - INERTIA_SSR_ENABLED=true
      - INERTIA_SSR_URL=http://ssr:13714
    depends_on:
      - ssr

  ssr:
    image: ghcr.io/your-username/gongyu:ssr
```

### Build Docker Images Locally

The Dockerfile contains two targets:

```bash
# Build main app image (FrankenPHP)
docker build --target app -t gongyu:latest -f deploy/Dockerfile .

# Build SSR sidecar image (Node.js)
docker build --target ssr -t gongyu:ssr -f deploy/Dockerfile .
```

## API / Feeds

- **Atom Feed**: `/feed` - All public bookmarks in Atom format
- **Single Bookmark**: `/b/{shortUrl}` - View a single bookmark
- **Legacy Shaarli**: `/shaare/{hash}` - Redirects to new URL

## License

MIT

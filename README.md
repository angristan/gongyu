<p align="center">
  <img src="public/images/logo.png" alt="Gongyu" width="120" height="120">
</p>

# Gongyu

A modern, self-hosted, single-tenant bookmark manager inspired by [Shaarli](https://github.com/shaarli/Shaarli). Built with Laravel 12, React, Mantine UI, and Inertia.js.

## Features

- **Bookmark Management** - Save, organize, and search your bookmarks
- **Full-Text Search** - Fast search powered by SQLite FTS5 or PostgreSQL tsvector
- **OpenGraph Thumbnails** - Automatically fetches og:image from bookmarked URLs for visual previews
- **Bookmarklet** - Quick-add bookmarks from any page with a browser bookmarklet
- **Shaarli Import** - Migrate from Shaarli with full history preservation (including original dates)
- **Legacy URL Support** - 301 redirects from old Shaarli URLs (`/shaare/{hash}`)
- **Atom Feed** - Subscribe to your bookmarks at `/feed`
- **Social Sharing** - Optional auto-posting to Twitter, Mastodon, and Bluesky
- **Dashboard** - Stats and visualizations of your bookmark collection
- **Cozy Theme** - Warm, paper-textured aesthetic with automatic dark/light mode

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

## Self-Hosting

See [docs/self-hosting.md](docs/self-hosting.md) for Docker deployment instructions.

## API / Feeds

- **Atom Feed**: `/feed` - All public bookmarks in Atom format
- **Single Bookmark**: `/b/{shortUrl}` - View a single bookmark
- **Legacy Shaarli**: `/shaare/{hash}` - Redirects to new URL

## License

MIT

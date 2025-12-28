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
- **Shaarli Migration** - Three import methods: API, Database file, or HTML export
- **Export** - Download bookmarks as HTML (Netscape format) or JSON
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

## Exporting Bookmarks

Go to Settings > Export to download your bookmarks:
- **HTML**: Netscape bookmark format (compatible with browsers and Shaarli)
- **JSON**: Full data backup with all fields

## Self-Hosting

See [docs/self-hosting.md](docs/self-hosting.md) for Docker deployment instructions.

## API / Feeds

- **Atom Feed**: `/feed` - All public bookmarks in Atom format
- **Single Bookmark**: `/b/{shortUrl}` - View a single bookmark
- **Legacy Shaarli**: `/shaare/{hash}` - Redirects to new URL

## License

MIT

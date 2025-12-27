# Self-Hosting Guide

This guide covers deploying Gongyu with Docker.

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

## Environment Variables

### Database

```env
# SQLite (default)
DB_CONNECTION=sqlite

# PostgreSQL
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_DATABASE=gongyu
DB_USERNAME=gongyu
DB_PASSWORD=secret
```

### Analytics (Optional)

Gongyu supports [Umami](https://umami.is/) for privacy-friendly analytics:

```env
UMAMI_URL=https://your-umami-instance.com
UMAMI_WEBSITE_ID=your-website-id
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

# Self-Hosting

## Quick Start

Minimal setup with SQLite, database sessions, and synchronous queue:

```yaml
services:
    web:
        image: ghcr.io/angristan/gongyu:latest
        ports:
            - "8000:8080"
        environment:
            APP_URL: http://localhost:8000
            SESSION_DRIVER: database
            QUEUE_CONNECTION: sync
        volumes:
            - gongyu_data:/app/database
        command: ["sh", "-c", "php artisan key:generate --force && php artisan optimize && php artisan migrate --force && php artisan octane:start --server=frankenphp --host=0.0.0.0 --port=8080 --log-level=info --caddyfile=./deploy/Caddyfile.octane --max-requests=100"]

volumes:
    gongyu_data:
```

```bash
docker compose up -d
```

Access at <http://localhost:8000>.

## Full Setup

For production with Redis (queue, cache) and PostgreSQL, use the full setup in `deploy/`:

```bash
cd deploy
cp .env.compose .env.compose.local
# Edit APP_URL to your domain
docker compose up -d
```

This includes:

- **Web server** (FrankenPHP/Octane)
- **Queue worker** (background jobs)
- **Scheduler** (scheduled tasks)
- **Redis** (queue, cache)
- **PostgreSQL** (optional, via `--profile postgres`)

## Configuration

| Variable             | Description                                |
| -------------------- | ------------------------------------------ |
| `APP_URL`            | Your domain (e.g., `https://example.com`)  |
| `DB_CONNECTION`      | `sqlite` (default) or `pgsql`              |
| `SESSION_DRIVER`     | `database` (default) or `redis`            |
| `QUEUE_CONNECTION`   | `sync`, `database`, or `redis`             |

## Performance Tuning

By default, the web server runs with **Laravel Octane**, which keeps your application in memory between requests.

For **low-memory environments** (small VPS, Raspberry Pi), use classic FrankenPHP mode:

```yaml
command: ["sh", "-c", "php artisan key:generate --force && php artisan optimize && php artisan migrate --force && frankenphp run --config ./deploy/Caddyfile.classic"]
```

| Mode             | Memory | Performance | Use Case               |
| ---------------- | ------ | ----------- | ---------------------- |
| Octane (default) | Higher | Fast        | Production, most users |
| Classic          | Lower  | Standard    | Low-memory VPS, RPi    |

## Using PostgreSQL

```yaml
services:
    web:
        image: ghcr.io/angristan/gongyu:latest
        ports:
            - "8000:8080"
        environment:
            APP_URL: http://localhost:8000
            SESSION_DRIVER: database
            QUEUE_CONNECTION: sync
            DB_CONNECTION: pgsql
            DB_HOST: postgres
            DB_DATABASE: gongyu
            DB_USERNAME: gongyu
            DB_PASSWORD: secret
        command: ["sh", "-c", "php artisan key:generate --force && php artisan optimize && php artisan migrate --force && php artisan octane:start --server=frankenphp --host=0.0.0.0 --port=8080 --log-level=info --caddyfile=./deploy/Caddyfile.octane --max-requests=100"]
        depends_on:
            postgres:
                condition: service_healthy

    postgres:
        image: postgres:17-alpine
        environment:
            POSTGRES_DB: gongyu
            POSTGRES_USER: gongyu
            POSTGRES_PASSWORD: secret
        volumes:
            - postgres_data:/var/lib/postgresql/data
        healthcheck:
            test: ["CMD", "pg_isready", "-U", "gongyu"]

volumes:
    postgres_data:
```

## Reverse Proxy

### Caddy

```
gongyu.example.com {
    reverse_proxy localhost:8000
}
```

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name gongyu.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Useful Commands

```bash
# View logs
docker compose logs -f web

# Stop everything
docker compose down

# Update to latest version
docker compose pull && docker compose up -d
```

## Backups

### SQLite

```bash
docker compose exec web cat /app/database/database.sqlite > backup-$(date +%F).sqlite
```

### PostgreSQL

```bash
docker compose exec postgres pg_dump -U gongyu gongyu > backup-$(date +%F).sql
```

## Manual Installation

```bash
git clone https://github.com/angristan/gongyu
cd gongyu

composer install --no-dev --optimize-autoloader
npm install && npm run build

cp .env.example .env
php artisan key:generate
php artisan migrate

php artisan serve
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
